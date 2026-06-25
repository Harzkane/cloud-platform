package jobs

import (
	"fmt"
	"log"
	"time"

	internalapi "github.com/nexgenhost/worker/internal/api"
	"github.com/nexgenhost/worker/internal/docker"
	"github.com/nexgenhost/worker/internal/git"
	"github.com/nexgenhost/worker/internal/routes"
	"github.com/nexgenhost/worker/internal/slug"
)

// DeployJob matches the payload pushed by Hono's BullMQ producer
type DeployJob struct {
	DeploymentID string            `json:"deploymentId"`
	ProjectID    string            `json:"projectId"`
	ProjectName  string            `json:"projectName"`
	GitRepo      string            `json:"gitRepo"`
	CommitHash   string            `json:"commitHash"`
	Runtime      string            `json:"runtime"`
	BuildCmd     string            `json:"buildCmd"`
	StartCmd     string            `json:"startCmd"`
	Port         int               `json:"port"`
	EnvVars      map[string]string `json:"envVars"`
	CallbackURL  string            `json:"callbackUrl"`
	WorkDir      string            `json:"-"` // set by worker at runtime
	BaseDomain   string            `json:"-"` // set by worker at runtime
	RouteMgr     *routes.Manager   `json:"-"` // set by worker at runtime
}

// Handle executes the full deployment pipeline for a single job.
// Steps: clone → build → run → health check → report back
func Handle(job DeployJob) error {
	startTime := time.Now()
	reporter := internalapi.NewReporter(job.CallbackURL)

	logf := func(status, format string, args ...any) {
		msg := fmt.Sprintf(format, args...)
		log.Printf("[Job %s] %s", job.DeploymentID[:8], msg)
		reporter.ReportLog(job.DeploymentID, status, msg+"\n")
	}

	appSlug := slug.FromProjectName(job.ProjectName)
	hostPort := docker.HostPortForDeployment(job.DeploymentID)

	// ── STEP 1: Clone repository ─────────────────────────
	logf("CLONING", "→ Cloning %s @ %s", job.GitRepo, job.CommitHash)
	reporter.Report(internalapi.CallbackPayload{
		DeploymentID: job.DeploymentID,
		Status:       "CLONING",
		LogChunk:     fmt.Sprintf("→ Cloning %s @ %s\n", job.GitRepo, job.CommitHash),
	})

	repoDir, err := git.Clone(job.GitRepo, job.CommitHash, job.WorkDir, job.DeploymentID)
	if err != nil {
		reporter.Report(internalapi.CallbackPayload{
			DeploymentID: job.DeploymentID,
			Status:       "FAILED",
			Error:        err.Error(),
			LogChunk:     fmt.Sprintf("✗ Clone failed: %v\n", err),
		})
		return fmt.Errorf("clone failed: %w", err)
	}
	defer git.Cleanup(repoDir)
	logf("CLONING", "✓ Repository cloned successfully")

	// ── STEP 2: Docker build ─────────────────────────────
	logf("BUILDING", "→ Building Docker image (runtime: %s)", job.Runtime)
	reporter.Report(internalapi.CallbackPayload{
		DeploymentID: job.DeploymentID,
		Status:       "BUILDING",
		LogChunk:     fmt.Sprintf("→ Building Docker image (runtime: %s)\n", job.Runtime),
	})

	buildResult, err := docker.Build(repoDir, job.DeploymentID, job.Runtime, job.BuildCmd, job.StartCmd)
	if buildResult != nil && buildResult.Logs != "" {
		reporter.ReportLog(job.DeploymentID, "BUILDING", buildResult.Logs)
	}
	if err != nil {
		reporter.Report(internalapi.CallbackPayload{
			DeploymentID: job.DeploymentID,
			Status:       "FAILED",
			Error:        err.Error(),
			LogChunk:     fmt.Sprintf("✗ Build failed: %v\n", err),
		})
		return fmt.Errorf("build failed: %w", err)
	}
	logf("BUILDING", "✓ Docker image built: %s", buildResult.ImageTag)

	// ── STEP 3: Run container ────────────────────────────
	containerName := fmt.Sprintf("ngx-%s", job.DeploymentID[:12])
	logf("STARTING", "→ Starting container '%s' on host port %d", containerName, hostPort)
	reporter.Report(internalapi.CallbackPayload{
		DeploymentID: job.DeploymentID,
		Status:       "STARTING",
		ImageTag:     buildResult.ImageTag,
		LogChunk:     fmt.Sprintf("→ Starting container '%s' on host port %d\n", containerName, hostPort),
	})

	runResult, err := docker.Run(docker.RunConfig{
		ImageTag:      buildResult.ImageTag,
		ContainerName: containerName,
		ContainerPort: job.Port,
		HostPort:      hostPort,
		EnvVars:       job.EnvVars,
		AppSlug:       appSlug,
		BaseDomain:    job.BaseDomain,
	})
	if err != nil {
		reporter.Report(internalapi.CallbackPayload{
			DeploymentID: job.DeploymentID,
			Status:       "FAILED",
			Error:        err.Error(),
			LogChunk:     fmt.Sprintf("✗ Container failed to start: %v\n", err),
		})
		return fmt.Errorf("run failed: %w", err)
	}

	// Register route so Nginx → proxy → container
	if job.RouteMgr != nil {
		if err := job.RouteMgr.Set(appSlug, runResult.HostPort); err != nil {
			log.Printf("[Job %s] Warning: failed to write routes.json: %v", job.DeploymentID[:8], err)
		}
	}

	// ── STEP 4: Report success ───────────────────────────
	duration := int(time.Since(startTime).Seconds())
	logf("RUNNING", "✓ Deployment successful! Live at: %s", runResult.LiveURL)
	reporter.Report(internalapi.CallbackPayload{
		DeploymentID: job.DeploymentID,
		Status:       "RUNNING",
		ContainerID:  runResult.ContainerID,
		LiveURL:      runResult.LiveURL,
		Duration:     &duration,
		LogChunk:     fmt.Sprintf("✓ Deployment complete in %ds 🎉\n→ Live at: %s\n", duration, runResult.LiveURL),
	})

	log.Printf("[Job %s] ✓ Done in %ds — %s", job.DeploymentID[:8], duration, runResult.LiveURL)
	return nil
}
