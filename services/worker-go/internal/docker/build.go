package docker

import (
	"bytes"
	"fmt"
	"log"
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
func Build(repoDir, deploymentID, runtime, buildCmd string) (*BuildResult, error) {
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
		dockerfile := generateDockerfile(runtime, buildCmd)
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
func generateDockerfile(runtime, buildCmd string) string {
	switch {
	case strings.HasPrefix(runtime, "node"):
		return fmt.Sprintf(`FROM %s
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN %s
EXPOSE 3000
CMD ["npm", "start"]
`, runtime, buildCmd)

	case strings.HasPrefix(runtime, "python"):
		return fmt.Sprintf(`FROM %s
WORKDIR /app
COPY requirements*.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "main.py"]
`, runtime)

	case strings.HasPrefix(runtime, "golang"):
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
	_, err := exec.Command("test", "-f", path).Output()
	return err == nil
}
