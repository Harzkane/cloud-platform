package jobs

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
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
	VmIP         string            `json:"vmIp"`
	AgentToken   string            `json:"agentToken"`
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

	// ── STEP 1.5: Provision host dependencies (NCP Agent) ──
	if err := provisionHostVM(job, logf); err != nil {
		reporter.Report(internalapi.CallbackPayload{
			DeploymentID: job.DeploymentID,
			Status:       "FAILED",
			Error:        err.Error(),
			LogChunk:     fmt.Sprintf("✗ Host provisioning failed: %v\n", err),
		})
		return fmt.Errorf("host provisioning failed: %w", err)
	}

	// ── STEP 2: Docker build ─────────────────────────────
	logf("BUILDING", "→ Building Docker image (runtime: %s)", job.Runtime)

	buildResult, err := docker.Build(repoDir, job.DeploymentID, job.Runtime, job.BuildCmd, job.StartCmd, job.EnvVars, func(line string) {
		reporter.ReportLog(job.DeploymentID, "BUILDING", line)
	})
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

// ProvisionResponse represents the JSON response from ncp-agent POST /api/v1/deploy
type ProvisionResponse struct {
	DeploymentID string   `json:"deploymentId"`
	Modules      []string `json:"modules"`
	Message      string   `json:"message"`
}

// ProvisionStatusResponse represents ncp-agent GET /api/v1/status/:session_id
type ProvisionStatusResponse struct {
	SessionID string `json:"session_id"`
	Status    string `json:"status"`
}

func provisionHostVM(job DeployJob, logf func(string, string, ...any)) error {
	if job.VmIP == "" || job.AgentToken == "" || strings.Contains(job.VmIP, "pending") {
		// If VM IP is empty/pending, skip provisioning (fallback to local/default VM setup)
		return nil
	}

	targetIP := job.VmIP
	if strings.HasPrefix(targetIP, "127.0.0.") || targetIP == "145.241.186.149" || targetIP == "35.237.210.35" {
		targetIP = "127.0.0.1"
	}

	logf("BUILDING", "→ Contacting ncp-agent to verify/install dependencies on %s", job.VmIP)

	// Determine required modules based on project runtime
	modules := []string{"docker"} // Docker is always required
	if strings.Contains(strings.ToLower(job.Runtime), "node") {
		modules = append(modules, "node", "nginx")
	}

	payload := map[string]any{"modules": modules}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal modules payload: %w", err)
	}

	url := fmt.Sprintf("http://%s:3001/api/v1/deploy", targetIP)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create provisioning request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", job.AgentToken))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		// Log warning and fallback (for local dev resilience)
		log.Printf("[Job %s] Warning: ncp-agent unreachable at %s: %v", job.DeploymentID[:8], url, err)
		logf("BUILDING", "⚠ Target VM agent unreachable. Proceeding with caution...")
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusConflict {
		logf("BUILDING", "→ Target VM is already running another provisioning task. Waiting...")
	} else if resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ncp-agent rejected deploy request with status: %d", resp.StatusCode)
	}

	var provResp ProvisionResponse
	if err := json.NewDecoder(resp.Body).Decode(&provResp); err != nil {
		// If response decoding fails but HTTP code was successful, we proceed
		return nil
	}

	sessionID := provResp.DeploymentID
	if sessionID == "" {
		logf("BUILDING", "✓ Target VM dependencies already ready")
		return nil
	}

	logf("BUILDING", "→ Provisioning session %s started. Installing: %v", sessionID, modules)

	// Poll status until COMPLETED or FAILED
	deadline := time.Now().Add(5 * time.Minute)
	for time.Now().Before(deadline) {
		statusUrl := fmt.Sprintf("http://%s:3001/api/v1/status/%s", targetIP, sessionID)
		statusReq, err := http.NewRequest("GET", statusUrl, nil)
		if err != nil {
			return fmt.Errorf("failed to create status check request: %w", err)
		}
		statusReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", job.AgentToken))

		statusResp, err := client.Do(statusReq)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}

		var stat ProvisionStatusResponse
		err = json.NewDecoder(statusResp.Body).Decode(&stat)
		statusResp.Body.Close()

		if err == nil {
			if stat.Status == "COMPLETED" {
				logf("BUILDING", "✓ Host dependencies provisioned successfully")
				return nil
			} else if stat.Status == "FAILED" {
				return fmt.Errorf("host provisioning failed on target VM")
			}
			logf("BUILDING", "→ Host provisioning status: %s...", stat.Status)
		}

		time.Sleep(5 * time.Second)
	}

	return fmt.Errorf("host provisioning timed out after 5 minutes")
}
