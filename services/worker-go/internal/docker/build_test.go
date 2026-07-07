package docker

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateDockerfileWorkspaces(t *testing.T) {
	// Create a temp directory to simulate a repo
	tempDir, err := os.MkdirTemp("", "repo-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create root package.json
	rootPkg := `{ "name": "root", "workspaces": ["frontend", "backend"] }`
	if err := os.WriteFile(filepath.Join(tempDir, "package.json"), []byte(rootPkg), 0644); err != nil {
		t.Fatalf("failed to write root package.json: %v", err)
	}

	// Create frontend folder and package.json
	frontendDir := filepath.Join(tempDir, "frontend")
	if err := os.Mkdir(frontendDir, 0755); err != nil {
		t.Fatalf("failed to create frontend dir: %v", err)
	}
	frontendPkg := `{ "name": "frontend", "dependencies": { "next": "14.0.0" } }`
	if err := os.WriteFile(filepath.Join(frontendDir, "package.json"), []byte(frontendPkg), 0644); err != nil {
		t.Fatalf("failed to write frontend package.json: %v", err)
	}

	// Create backend folder and package.json
	backendDir := filepath.Join(tempDir, "backend")
	if err := os.Mkdir(backendDir, 0755); err != nil {
		t.Fatalf("failed to create backend dir: %v", err)
	}
	backendPkg := `{ "name": "backend" }`
	if err := os.WriteFile(filepath.Join(backendDir, "package.json"), []byte(backendPkg), 0644); err != nil {
		t.Fatalf("failed to write backend package.json: %v", err)
	}

	// Also mock a lock file to trigger npm ci
	if err := os.WriteFile(filepath.Join(tempDir, "package-lock.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to write lock file: %v", err)
	}

	dockerfile := generateDockerfile(tempDir, "node:20-alpine", "npm run build", "npm run start", nil)

	// Verify COPY commands exist for frontend and backend package.jsons
	if !strings.Contains(dockerfile, "COPY frontend/package.json ./frontend/") {
		t.Errorf("expected dockerfile to copy frontend/package.json, got:\n%s", dockerfile)
	}
	if !strings.Contains(dockerfile, "COPY backend/package.json ./backend/") {
		t.Errorf("expected dockerfile to copy backend/package.json, got:\n%s", dockerfile)
	}

	// Verify it contains npm ci install command
	if !strings.Contains(dockerfile, "RUN npm ci") {
		t.Errorf("expected npm ci install command, got:\n%s", dockerfile)
	}

	// Verify build and prune steps
	if !strings.Contains(dockerfile, "RUN npm run build") {
		t.Errorf("expected build step, got:\n%s", dockerfile)
	}
	if !strings.Contains(dockerfile, "RUN npm prune --omit=dev") {
		t.Errorf("expected prune step, got:\n%s", dockerfile)
	}

	// Verify final stage copies from builder
	if !strings.Contains(dockerfile, "COPY --from=builder /app .") {
		t.Errorf("expected COPY --from=builder /app ., got:\n%s", dockerfile)
	}
}

func TestGenerateDockerfileNoBuildCmd(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "repo-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	if err := os.WriteFile(filepath.Join(tempDir, "package.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to write package.json: %v", err)
	}

	dockerfile := generateDockerfile(tempDir, "node:20-alpine", "   ", "npm run start", nil)

	// RUN <buildCmd> should be omitted entirely
	if strings.Contains(dockerfile, "RUN    ") || strings.Contains(dockerfile, "RUN \n") {
		t.Errorf("expected build step to be omitted, got:\n%s", dockerfile)
	}
}

func TestGenerateDockerfileEnvVarInjection(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "repo-env-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	if err := os.WriteFile(filepath.Join(tempDir, "package.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to write package.json: %v", err)
	}

	envVars := map[string]string{
		"MONGODB_URI": "mongodb+srv://user:pass@cluster.mongodb.net/db",
		"NODE_ENV":    "production",
	}

	dockerfile := generateDockerfile(tempDir, "node:20-alpine", "npm run build", "npm start", envVars)

	// Verify ENV statements are present in the Dockerfile
	if !strings.Contains(dockerfile, "ENV MONGODB_URI=\"") {
		t.Errorf("expected ENV MONGODB_URI to be injected, got:\n%s", dockerfile)
	}
	if !strings.Contains(dockerfile, "ENV NODE_ENV=\"") {
		t.Errorf("expected ENV NODE_ENV to be injected, got:\n%s", dockerfile)
	}

	// Verify quotes are present (values wrapped in double quotes)
	if !strings.Contains(dockerfile, `"mongodb+srv://user:pass@cluster.mongodb.net/db"`) {
		t.Errorf("expected MONGODB_URI value to be quoted, got:\n%s", dockerfile)
	}

	// Env block should appear BEFORE the build step so build phase has access
	envIdx := strings.Index(dockerfile, "ENV MONGODB_URI")
	buildIdx := strings.Index(dockerfile, "RUN npm run build")
	if envIdx == -1 || buildIdx == -1 {
		t.Fatalf("could not find ENV or RUN build step in:\n%s", dockerfile)
	}
	if envIdx > buildIdx {
		t.Errorf("expected ENV block before RUN npm run build, but it came after")
	}
}
