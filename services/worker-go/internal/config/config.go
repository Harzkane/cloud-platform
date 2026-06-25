package config

import (
	"log"
	"os"
)

// Config holds all worker configuration loaded from environment variables
type Config struct {
	RedisURL       string
	QueueName      string
	CallbackURL    string // base URL of the Hono API internal endpoint
	InternalSecret string
	WorkDir        string // temp build directory
	WorkerID       string // unique ID for this worker instance
	MaxConcurrent  int    // max simultaneous deployments
	BaseDomain     string // e.g. naijadevhub.online
	RoutesFile     string // path to routes.json for Nginx proxy
	ProxyAddr      string // local reverse proxy listen address
}

func Load() *Config {
	cfg := &Config{
		RedisURL:       getEnv("WORKER_REDIS_URL", "redis://localhost:6379"),
		QueueName:      getEnv("WORKER_DEPLOY_QUEUE", "nexgenhost-deployments"),
		CallbackURL:    getEnv("WORKER_API_CALLBACK_URL", "http://localhost:3000/internal"),
		InternalSecret: getEnv("INTERNAL_SECRET", "internal_dev_secret"),
		WorkDir:        getEnv("WORKER_WORK_DIR", "/tmp/nexgenhost/builds"),
		WorkerID:       getEnv("WORKER_ID", "worker-1"),
		MaxConcurrent:  2, // Oracle free tier — be conservative
		BaseDomain:     getEnv("BASE_DOMAIN", "naijadevhub.online"),
		RoutesFile:     getEnv("ROUTES_FILE", "/opt/nexhost-worker/routes.json"),
		ProxyAddr:      getEnv("PROXY_ADDR", "127.0.0.1:8080"),
	}

	log.Printf("[Config] Redis: %s | Queue: %s | WorkDir: %s",
		cfg.RedisURL, cfg.QueueName, cfg.WorkDir)

	return cfg
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
