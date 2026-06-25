package slug

import (
	"regexp"
	"strings"
)

var multiHyphen = regexp.MustCompile(`-+`)

// FromProjectName turns a project name into a DNS-safe subdomain label.
func FromProjectName(name string) string {
	s := strings.ToLower(name)
	s = regexp.MustCompile(`[^a-z0-9-]`).ReplaceAllString(s, "-")
	s = multiHyphen.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 63 {
		s = s[:63]
	}
	return s
}
