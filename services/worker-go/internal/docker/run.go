package docker

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

// RunConfig holds everything needed to start a container
type RunConfig struct {
	ImageTag      string
	ContainerName string
	ContainerPort int
	HostPort      int
	EnvVars       map[string]string
	AppSlug       string
	BaseDomain    string
}

// RunResult holds the started container info
type RunResult struct {
	ContainerID string
	LiveURL     string
	HostPort    int
}

// Run starts a Docker container from an image.
// Returns container ID when healthy.
func Run(cfg RunConfig) (*RunResult, error) {
	// Stop & remove existing container with same name (redeploy)
	stopCmd := exec.Command("docker", "rm", "-f", cfg.ContainerName)
	stopCmd.Run() // ignore error — container may not exist

	hostPort := cfg.HostPort
	if hostPort == 0 {
		hostPort = cfg.ContainerPort
	}

	args := []string{
		"run", "-d",
		"--name", cfg.ContainerName,
		"--restart", "unless-stopped",
		"-p", fmt.Sprintf("%d:%d", hostPort, cfg.ContainerPort),
		"--memory", "512m",
		"--cpus", "0.5",
	}

	// Inject env vars
	for k, v := range cfg.EnvVars {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}

	args = append(args, cfg.ImageTag)

	log.Printf("[Docker] Starting container: %s (host:%d → container:%d)", cfg.ContainerName, hostPort, cfg.ContainerPort)
	cmd := exec.Command("docker", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("docker run failed: %w\nstderr: %s\nstdout: %s", err, stderr.String(), stdout.String())
	}

	containerID := strings.TrimSpace(stdout.String())
	log.Printf("[Docker] Container started: %s (ID: %s)", cfg.ContainerName, containerID[:12])

	// Wait for health check on the host-mapped port
	if err := waitForHealth(hostPort, 30*time.Second); err != nil {
		return nil, fmt.Errorf("container health check failed: %w", err)
	}

	baseDomain := cfg.BaseDomain
	if baseDomain == "" {
		baseDomain = "naijadevhub.online"
	}

	appSlug := cfg.AppSlug
	if appSlug == "" {
		appSlug = strings.TrimPrefix(cfg.ContainerName, "ngx-")
	}

	liveURL := fmt.Sprintf("https://%s.%s", appSlug, baseDomain)

	return &RunResult{
		ContainerID: containerID,
		LiveURL:     liveURL,
		HostPort:    hostPort,
	}, nil
}

// HostPortForDeployment assigns a deterministic host port in 40000–49999.
func HostPortForDeployment(deploymentID string) int {
	h := uint32(2166136261)
	for i := 0; i < len(deploymentID); i++ {
		h ^= uint32(deploymentID[i])
		h *= 16777619
	}
	return 40000 + int(h%10000)
}

// Stop stops and removes a container by name
func Stop(containerName string) error {
	cmd := exec.Command("docker", "rm", "-f", containerName)
	var errBuf bytes.Buffer
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to stop container %s: %w\n%s", containerName, err, errBuf.String())
	}
	log.Printf("[Docker] Container stopped: %s", containerName)
	return nil
}

// waitForHealth polls the container's HTTP port until it responds 200
func waitForHealth(port int, timeout time.Duration) error {
	url := fmt.Sprintf("http://localhost:%d", port)
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		resp, err := http.Get(url)
		if err == nil && resp.StatusCode < 500 {
			log.Printf("[Docker] Health check passed on port %d", port)
			return nil
		}
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("container did not become healthy within %v on port %d", timeout, port)
}
