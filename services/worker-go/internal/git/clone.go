package git

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

// Clone clones a git repository to a temp directory.
// Returns the path to the cloned repo.
func Clone(repoURL, commitHash, workDir, deploymentID string) (string, error) {
	destDir := filepath.Join(workDir, deploymentID)

	// Clean up any existing directory
	if err := os.RemoveAll(destDir); err != nil {
		return "", fmt.Errorf("cleanup failed: %w", err)
	}
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", fmt.Errorf("mkdir failed: %w", err)
	}

	log.Printf("[Git] Cloning %s into %s", repoURL, destDir)

	// Shallow clone for speed
	cloneCmd := exec.Command("git", "clone", "--depth=50", repoURL, destDir)
	cloneCmd.Stdout = os.Stdout
	cloneCmd.Stderr = os.Stderr

	if err := cloneCmd.Run(); err != nil {
		return "", fmt.Errorf("git clone failed: %w", err)
	}

	// Checkout specific commit if not HEAD
	if commitHash != "HEAD" && commitHash != "" {
		checkoutCmd := exec.Command("git", "-C", destDir, "checkout", commitHash)
		checkoutCmd.Stdout = os.Stdout
		checkoutCmd.Stderr = os.Stderr

		if err := checkoutCmd.Run(); err != nil {
			return "", fmt.Errorf("git checkout %s failed: %w", commitHash, err)
		}
	}

	log.Printf("[Git] Clone complete: %s @ %s", repoURL, commitHash)
	return destDir, nil
}

// Cleanup removes the build directory after deployment
func Cleanup(repoDir string) {
	if err := os.RemoveAll(repoDir); err != nil {
		log.Printf("[Git] Warning: failed to cleanup %s: %v", repoDir, err)
	}
}
