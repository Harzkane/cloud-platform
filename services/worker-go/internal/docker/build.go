package docker

import (
	"bufio"
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// BuildResult holds the output of a docker build
type BuildResult struct {
	ImageTag string
	Logs     string
}

// Build runs `docker build` on a given source directory.
// baseImage is used as the runtime if no Dockerfile is present.
func Build(repoDir, deploymentID, runtime, buildCmd, startCmd string, envVars map[string]string, onLog func(string)) (*BuildResult, error) {
	imageTag := fmt.Sprintf("nexgenhost/%s:latest", deploymentID)

	var logBuf bytes.Buffer

	// Check if repo has its own Dockerfile
	hasDockerfile := fileExists(repoDir + "/Dockerfile")

	var cmd *exec.Cmd
	if hasDockerfile {
		log.Printf("[Docker] Building with existing Dockerfile: %s", imageTag)
		cmd = exec.Command("docker", "build", "-t", imageTag, ".")
		cmd.Dir = repoDir
	} else {
		log.Printf("[Docker] Generating Dockerfile for runtime %s with %d env vars", runtime, len(envVars))
		// Generate an inline Dockerfile, injecting env vars directly to bypass .dockerignore
		dockerfile := generateDockerfile(repoDir, runtime, buildCmd, startCmd, envVars)
		cmd = exec.Command(
			"docker", "build",
			"-t", imageTag,
			"-f", "-", // read Dockerfile from stdin
			".",
		)
		cmd.Dir = repoDir
		cmd.Stdin = strings.NewReader(dockerfile)
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}
	cmd.Stderr = cmd.Stdout // Redirect stderr to stdout to capture everything

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start docker build: %w", err)
	}

	// Stream output line by line in real-time
	scanner := bufio.NewScanner(stdoutPipe)
	for scanner.Scan() {
		line := scanner.Text()
		logBuf.WriteString(line + "\n")
		if onLog != nil {
			onLog(line + "\n")
		}
	}

	if err := cmd.Wait(); err != nil {
		return &BuildResult{Logs: logBuf.String()},
			fmt.Errorf("docker build failed: %w\n%s", err, logBuf.String())
	}

	log.Printf("[Docker] Build complete: %s", imageTag)
	return &BuildResult{ImageTag: imageTag, Logs: logBuf.String()}, nil
}

// findPackageJsons recursively finds relative paths to all package.json files in a directory,
// ignoring common build/dependency folders.
func findPackageJsons(repoDir string) []string {
	var paths []string
	err := filepath.Walk(repoDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			name := info.Name()
			if name == "node_modules" || name == ".git" || name == ".next" || name == "dist" || name == "build" || name == "out" {
				return filepath.SkipDir
			}
			return nil
		}
		if info.Name() == "package.json" {
			rel, err := filepath.Rel(repoDir, path)
			if err == nil {
				paths = append(paths, rel)
			}
		}
		return nil
	})
	if err != nil {
		log.Printf("[Docker] Error walking repoDir for package.jsons: %v", err)
	}
	return paths
}

// buildEnvBlock converts a map of env vars into a series of Dockerfile ENV statements.
// Injecting directly into the Dockerfile guarantees availability during build AND runtime,
// bypassing any .dockerignore rules that would block .env.local from being copied.
func buildEnvBlock(envVars map[string]string) string {
	if len(envVars) == 0 {
		return ""
	}
	var sb strings.Builder
	for k, v := range envVars {
		// Wrap value in quotes and escape any embedded quotes
		escapedVal := strings.ReplaceAll(v, `"`, `\"`)
		sb.WriteString(fmt.Sprintf("ENV %s=\"%s\"\n", k, escapedVal))
	}
	return sb.String()
}

// generateDockerfile creates a minimal Dockerfile for common runtimes
func generateDockerfile(repoDir, runtime, buildCmd, startCmd string, envVars map[string]string) string {
	envBlock := buildEnvBlock(envVars)
	switch {
	case strings.HasPrefix(runtime, "node") && fileExists(repoDir+"/package.json"):
		packageJsons := findPackageJsons(repoDir)
		var copyInstructions []string
		copyInstructions = append(copyInstructions, "COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* pnpm-workspace.yaml* ./")
		for _, relPath := range packageJsons {
			if relPath == "package.json" {
				continue
			}
			dir := filepath.Dir(relPath)
			dir = filepath.Clean(dir)
			copyInstructions = append(copyInstructions, fmt.Sprintf("COPY %s ./%s/", relPath, dir))
		}
		copyLock := strings.Join(copyInstructions, "\n")

		installCmd := "npm install"
		pruneCmd := "npm prune --omit=dev"

		if fileExists(repoDir + "/pnpm-lock.yaml") {
			installCmd = "npm install -g pnpm && pnpm install --frozen-lockfile"
			pruneCmd = "pnpm prune --prod"
		} else if fileExists(repoDir + "/yarn.lock") {
			installCmd = "yarn install --frozen-lockfile"
			pruneCmd = "yarn install --production --frozen-lockfile"
		} else if fileExists(repoDir + "/package-lock.json") {
			installCmd = "npm ci"
			pruneCmd = "npm prune --omit=dev"
		}

		buildRunStep := ""
		if strings.TrimSpace(buildCmd) != "" {
			buildRunStep = "RUN " + buildCmd
		}

		return fmt.Sprintf(`FROM %s AS builder
WORKDIR /app
%s
RUN %s
COPY . .
ENV NODE_OPTIONS="--max_old_space_size=1024"
%s
%s
RUN %s

FROM %s
WORKDIR /app
COPY --from=builder /app .
%s
EXPOSE 3000
CMD %s
`, runtime, copyLock, installCmd, envBlock, buildRunStep, pruneCmd,
			runtime, envBlock, startCmd)

	case strings.HasPrefix(runtime, "python") && fileExists(repoDir+"/requirements.txt"):
		return fmt.Sprintf(`FROM %s
WORKDIR /app
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "main.py"]
`, runtime) // Note: CMD can be overridden if python starter is generic

	case strings.HasPrefix(runtime, "golang") && fileExists(repoDir+"/go.mod"):
		return fmt.Sprintf(`FROM %s AS builder
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server ./...

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
`, runtime)

	default:
		buildRunStep := ""
		if strings.TrimSpace(buildCmd) != "" {
			buildRunStep = "\nRUN " + buildCmd
		}
		return fmt.Sprintf(`FROM %s
WORKDIR /app
COPY . .%s
EXPOSE 3000
`, runtime, buildRunStep)
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}


