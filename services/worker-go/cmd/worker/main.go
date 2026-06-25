package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/nexgenhost/worker/internal/config"
	"github.com/nexgenhost/worker/internal/jobs"
	"github.com/nexgenhost/worker/internal/proxy"
	"github.com/nexgenhost/worker/internal/routes"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load()

	// Ensure work directory exists
	if err := os.MkdirAll(cfg.WorkDir, 0755); err != nil {
		log.Fatalf("[Worker] Failed to create work dir: %v", err)
	}

	// Connect to Redis
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("[Worker] Invalid Redis URL: %v", err)
	}
	rdb := redis.NewClient(opt)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Test Redis connection
	if _, err := rdb.Ping(ctx).Result(); err != nil {
		log.Fatalf("[Worker] Cannot connect to Redis: %v", err)
	}
	log.Printf("[Worker] ✓ Connected to Redis")

	routeMgr := routes.NewManager(cfg.RoutesFile)
	go proxy.Start(cfg.ProxyAddr, routeMgr)

	fmt.Printf(`
  ╔══════════════════════════════════════╗
  ║   NexGenHost Go Worker  v0.1.0       ║
  ║   Hono decides. Go executes.         ║
  ╠══════════════════════════════════════╣
  ║  🔧  Worker ID: %-20s  ║
  ║  📦  Queue:     %-20s  ║
  ║  🧵  Max Jobs:  %-20d  ║
  ╚══════════════════════════════════════╝
`, cfg.WorkerID, cfg.QueueName, cfg.MaxConcurrent)

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Semaphore to limit concurrent deployments
	sem := make(chan struct{}, cfg.MaxConcurrent)
	var wg sync.WaitGroup

	// BullMQ stores jobs in Redis as sorted sets.
	// Key pattern: bull:<queue>:wait (LPOP to consume)
	waitKey := fmt.Sprintf("bull:%s:wait", cfg.QueueName)
	activeKey := fmt.Sprintf("bull:%s:active", cfg.QueueName)

	log.Printf("[Worker] 🚀 Listening on queue: %s", cfg.QueueName)

	for {
		select {
		case <-quit:
			log.Println("[Worker] Shutting down — waiting for active jobs...")
			cancel()
			wg.Wait()
			log.Println("[Worker] All jobs complete. Goodbye.")
			return
		default:
		}

		// BRPOPLPUSH: atomically move from wait → active list (timeout 2s)
		result, err := rdb.BRPopLPush(ctx, waitKey, activeKey, 2*time.Second).Result()
		if err == redis.Nil {
			continue // timeout — loop again
		}
		if err != nil {
			if ctx.Err() != nil {
				return // context cancelled
			}
			log.Printf("[Worker] Redis error: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}

		// Parse job ID from the result
		jobID := result

		// Fetch the actual job data from Redis
		dataKey := fmt.Sprintf("bull:%s:%s", cfg.QueueName, jobID)
		jobData, err := rdb.HGetAll(ctx, dataKey).Result()
		if err != nil || len(jobData) == 0 {
			log.Printf("[Worker] Could not fetch job data for %s: %v", jobID, err)
			continue
		}

		rawData := jobData["data"]
		var job jobs.DeployJob
		if err := json.Unmarshal([]byte(rawData), &job); err != nil {
			log.Printf("[Worker] Failed to parse job %s: %v", jobID, err)
			continue
		}
		job.WorkDir = cfg.WorkDir
		job.BaseDomain = cfg.BaseDomain
		job.RouteMgr = routeMgr

		// Acquire semaphore slot
		sem <- struct{}{}
		wg.Add(1)

		go func(j jobs.DeployJob, jID string) {
			defer func() {
				<-sem
				wg.Done()
				// Remove from active list when done
				rdb.LRem(ctx, activeKey, 1, jID)
			}()

			log.Printf("[Worker] Starting job %s (deployment: %s)", jID, j.DeploymentID[:8])
			if err := jobs.Handle(j); err != nil {
				log.Printf("[Worker] Job %s failed: %v", jID, err)
			}
		}(job, jobID)
	}
}
