package docker

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
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

// generateDockerfile creates a minimal Dockerfile for common runtimes
func generateDockerfile(repoDir, runtime, buildCmd, startCmd string) string {
	switch {
	case strings.HasPrefix(runtime, "node") && fileExists(repoDir+"/package.json"):
		copyLock := "COPY package.json ./"
		installCmd := "npm install"     // install ALL deps including devDeps for build
		ciInstallCmd := "npm install"

		if fileExists(repoDir + "/pnpm-lock.yaml") {
			installCmd = "npm install -g pnpm && pnpm install --frozen-lockfile"
			ciInstallCmd = "npm install -g pnpm && pnpm install --prod --frozen-lockfile"
			copyLock = "COPY package.json pnpm-lock.yaml ./"
		} else if fileExists(repoDir + "/yarn.lock") {
			installCmd = "yarn install --frozen-lockfile"
			ciInstallCmd = "yarn install --production --frozen-lockfile"
			copyLock = "COPY package.json yarn.lock ./"
		} else if fileExists(repoDir + "/package-lock.json") {
			installCmd = "npm ci"       // ci installs ALL deps (dev included) — needed for build tools
			ciInstallCmd = "npm ci --omit=dev"
			copyLock = "COPY package*.json ./"
		}

		return fmt.Sprintf(`FROM %s AS builder
WORKDIR /app
%s
RUN %s
COPY . .
RUN %s

FROM %s
WORKDIR /app
%s
RUN %s
COPY --from=builder /app .
EXPOSE 3000
CMD %s
`, runtime, copyLock, installCmd, buildCmd,
			runtime, copyLock, ciInstallCmd, startCmd)

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
		return fmt.Sprintf(`FROM %s
WORKDIR /app
COPY . .
RUN %s
EXPOSE 3000
`, runtime, buildCmd)
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

