package main

import (
	"flag"
	gostal "github.com/unused/gostal"
	"html/template"
	"log"
	"net/http"
	"os"
)

func main() {

	dbFile := flag.String("db", "subscribers.db", "filename for database")
	credsFile := flag.String("creds", "credentials.json", "filename for credentials")
	flag.Parse()

	port := os.Getenv("PORT")

	if port == "" {
		log.Fatal("[ERROR] $PORT must be set")
	}

	subscriber := os.Args[len(os.Args)-1]
	log.Printf("> Using subscriber %s", subscriber)

	ctx, err := gostal.New(subscriber, *dbFile, *credsFile)
	if err != nil {
		log.Fatal(err)
	}
	defer ctx.Close()

	serveHtml(&ctx)
	http.HandleFunc("/register", ctx.ServeHTTP)
	http.HandleFunc("/subscriptions/", ctx.ServeHTTP)

	log.Printf("> Starting service on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

// serveHtml serves the static assets.
func serveHtml(ctx *gostal.Service) {
	http.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		t, err := template.ParseFiles("static/index.html", "static/application.js")
		if err != nil {
			log.Fatal("[ERROR] Could not load templates")
		}
		t.ExecuteTemplate(w, "index", ctx.Keys.PublicKey)
	})
	http.HandleFunc("/sw.js", func(w http.ResponseWriter, req *http.Request) {
		http.ServeFile(w, req, "static/sw.js")
	})
}
