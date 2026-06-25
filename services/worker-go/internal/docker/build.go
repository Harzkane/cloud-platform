package docker

import (
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
func Build(repoDir, deploymentID, runtime, buildCmd, startCmd string) (*BuildResult, error) {
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
		log.Printf("[Docker] Generating Dockerfile for runtime %s", runtime)
		// Generate an inline Dockerfile
		dockerfile := generateDockerfile(repoDir, runtime, buildCmd, startCmd)
		cmd = exec.Command(
			"docker", "build",
			"-t", imageTag,
			"-f", "-", // read Dockerfile from stdin
			".",
		)
		cmd.Dir = repoDir
		cmd.Stdin = strings.NewReader(dockerfile)
	}

	cmd.Stdout = &logBuf
	cmd.Stderr = &logBuf

	if err := cmd.Run(); err != nil {
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

// generateDockerfile creates a minimal Dockerfile for common runtimes
func generateDockerfile(repoDir, runtime, buildCmd, startCmd string) string {
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
%s
RUN %s

FROM %s
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
CMD %s
`, runtime, copyLock, installCmd, buildRunStep, pruneCmd,
			runtime, startCmd)

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


