package main

import (
	"net/http"
	"github.com/PaNasMs/module-sdk/modulehost"
)

func main() {
	modulehost.Serve("terminal", func(allowed map[string]bool) http.Handler { return terminalHandler(allowed) })
}
