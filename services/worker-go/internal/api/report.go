package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

// Reporter sends deployment status and logs back to the Hono API
type Reporter struct {
	BaseURL string
	Secret  string
}

func NewReporter(baseURL string) *Reporter {
	return &Reporter{
		BaseURL: baseURL,
		Secret:  os.Getenv("INTERNAL_SECRET"),
	}
}

// CallbackPayload mirrors the internal route's expected body
type CallbackPayload struct {
	DeploymentID string  `json:"deploymentId"`
	Status       string  `json:"status"`
	LogChunk     string  `json:"logChunk,omitempty"`
	ContainerID  string  `json:"containerId,omitempty"`
	ImageTag     string  `json:"imageTag,omitempty"`
	LiveURL      string  `json:"liveUrl,omitempty"`
	Duration     *int    `json:"duration,omitempty"`
	Error        string  `json:"error,omitempty"`
}

func (r *Reporter) Report(payload CallbackPayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	req, err := http.NewRequest("POST", r.BaseURL+"/deploy/callback", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("request creation error: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Secret", r.Secret)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	return nil
}

// ReportLog is a convenience wrapper to send just a log chunk
func (r *Reporter) ReportLog(deploymentID, status, logChunk string) {
	err := r.Report(CallbackPayload{
		DeploymentID: deploymentID,
		Status:       status,
		LogChunk:     logChunk,
	})
	if err != nil {
		log.Printf("[Reporter] Warning: failed to report log chunk: %v", err)
	}
}
