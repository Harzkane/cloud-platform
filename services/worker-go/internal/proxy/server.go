package proxy

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/nexgenhost/worker/internal/routes"
)

// Start runs the local reverse proxy that Nginx forwards wildcard subdomains to.
func Start(addr string, routeMgr *routes.Manager) {
	http.HandleFunc("/_nexhost/health", func(w http.ResponseWriter, r *http.Request) {
		appName := r.Header.Get("X-App-Name")
		if appName == "" {
			appName = appNameFromHost(r.Host)
		}
		if routeMgr.Get(appName) == 0 {
			http.Error(w, "route not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		appName := r.Header.Get("X-App-Name")
		if appName == "" {
			appName = appNameFromHost(r.Host)
		}

		hostPort := routeMgr.Get(appName)
		if hostPort == 0 {
			http.Error(w, fmt.Sprintf("No route for app %q", appName), http.StatusNotFound)
			return
		}

		target, err := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", hostPort))
		if err != nil {
			http.Error(w, "bad upstream", http.StatusInternalServerError)
			return
		}

		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("[Proxy] upstream error for %s: %v", appName, err)
			http.Error(w, "upstream unavailable", http.StatusServiceUnavailable)
		}
		proxy.ServeHTTP(w, r)
	})

	log.Printf("[Proxy] Listening on %s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("[Proxy] Failed to start: %v", err)
	}
}

func appNameFromHost(host string) string {
	host = strings.Split(host, ":")[0]
	parts := strings.Split(host, ".")
	if len(parts) < 3 {
		return host
	}
	return parts[0]
}
