package routes

import (
	"encoding/json"
	"log"
	"os"
	"sync"
)

// Manager persists app-name → host-port mappings for the local reverse proxy.
type Manager struct {
	file string
	mu   sync.Mutex
}

func NewManager(file string) *Manager {
	return &Manager{file: file}
}

// Set records a route and writes routes.json atomically.
func (m *Manager) Set(appName string, hostPort int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	data := map[string]int{}
	if raw, err := os.ReadFile(m.file); err == nil {
		json.Unmarshal(raw, &data)
	}

	data[appName] = hostPort

	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(m.file, raw, 0644); err != nil {
		return err
	}

	log.Printf("[Routes] %s → localhost:%d", appName, hostPort)
	return nil
}

// Get returns the host port for an app name, or 0 if unknown.
func (m *Manager) Get(appName string) int {
	m.mu.Lock()
	defer m.mu.Unlock()

	raw, err := os.ReadFile(m.file)
	if err != nil {
		return 0
	}

	data := map[string]int{}
	if json.Unmarshal(raw, &data) != nil {
		return 0
	}

	return data[appName]
}

// All returns a snapshot of all routes.
func (m *Manager) All() map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()

	raw, err := os.ReadFile(m.file)
	if err != nil {
		return map[string]int{}
	}

	data := map[string]int{}
	if json.Unmarshal(raw, &data) != nil {
		return map[string]int{}
	}
	return data
}
