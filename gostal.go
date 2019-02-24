package gostal

import (
	"encoding/json"
	"errors"
	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/satori/go.uuid"
	bolt "go.etcd.io/bbolt"
	"html"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
)

// Service holds the database, subscriber identification and the vapid keys.
type Service struct {
	db         *bolt.DB
	Subscriber string
	Keys       vapidKeys
}

// vapidKeys holds the private/public key pair to use the VAPID protocol.
type vapidKeys struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

// RegisterResponse is the response format used to return the subscription key.
type RegisterResponse struct {
	Key string `json:"key"`
}

// New provides a new service. Given dbFile and credsFile will be created if
// they do not exist.
func New(subscriber string, dbFile string, credsFile string) (Service, error) {
	s := new(Service)
	s.Subscriber = subscriber
	s.loadKeys(credsFile)

	db, err := bolt.Open(dbFile, 0600, nil)
	if err != nil {
		return *s, err
	}

	s.db = db
	err = db.Update(func(tx *bolt.Tx) error {
		if _, err := tx.CreateBucketIfNotExists([]byte("subscribers")); err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		return *s, err
	}

	return *s, nil
}

// Close handles shutdown of the service, closes the database.
func (s *Service) Close() {
	s.db.Close()
}

// Get retrieves a subscription from the database.
func (s *Service) Get(key string) (webpush.Subscription, error) {
	var sub webpush.Subscription
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("subscribers"))
		v := b.Get([]byte(key))

		if v == nil {
			return errors.New("Subscription not found")
		}
		return json.Unmarshal(v, &sub)
	})
	return sub, err
}

// Set creates or updates a subscription in the database.
func (s *Service) Set(key string, sub webpush.Subscription) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket([]byte("subscribers"))
		data, err := json.Marshal(sub)
		if err != nil {
			return err
		}
		return bucket.Put([]byte(key), []byte(data))
	})
}

// Send delivers the notification
func (s *Service) Send(msg string, sub *webpush.Subscription) error {
	_, err := webpush.SendNotification([]byte(msg), sub, &webpush.Options{
		Subscriber:      s.Subscriber,
		VAPIDPublicKey:  s.Keys.PublicKey,
		VAPIDPrivateKey: s.Keys.PrivateKey,
		TTL:             30,
	})

	return err
}

// ServeHTTP works as a http handler function.
func (s *Service) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	log.Println("> Request received:", req.URL.Path)

	if req.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	path := html.EscapeString(req.URL.Path)

	if path == "/register" {
		key, err := s.register(req)
		if err != nil {
			log.Println("Error:", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		log.Println("> Register new key", key)

		data := RegisterResponse{key}
		response, err := json.Marshal(data)
		if err != nil {
			log.Println("Error:", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		w.Header().Set("Content-Type", "application/json")
		w.Write(response)
		return
	}

	key := path[(strings.LastIndex(path, "/") + 1):]
	log.Print("key: ", key)
	sub, err := s.Get(key)
	if err != nil {
		log.Println("  Key not found:", err)
		w.WriteHeader(http.StatusNotFound)
		return
	}
	msg, err := ioutil.ReadAll(req.Body)
	if err != nil {
		log.Println("  Message is empty:", err)
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if err := s.Send(string(msg), &sub); err != nil {
		log.Println("  Send failed:", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// register creates a new subscriber from the received web push credentials.
func (s *Service) register(req *http.Request) (string, error) {
	var sub webpush.Subscription

	data, err := ioutil.ReadAll(req.Body)
	if err != nil {
		return "", err
	}
	if err := json.Unmarshal(data, &sub); err != nil {
		return "", err
	}

	key := uuid.NewV4().String()
	if err := s.Set(key, sub); err != nil {
		return "", err
	}
	return key, nil
}

// loadKeys fetches the VAPID keys from the credentials file.
func (s *Service) loadKeys(filename string) error {
	if _, err := os.Stat(filename); os.IsNotExist(err) {
		if err = s.generateKeys(filename); err != nil {
			return err
		}
		return nil
	}

	data, err := ioutil.ReadFile(filename)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, &s.Keys)
}

// generateKeys generates a new VAPID key pair.
func (s *Service) generateKeys(filename string) error {
	privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return err
	}

	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()
	keys := vapidKeys{PublicKey: publicKey, PrivateKey: privateKey}
	writeBuffer, err := json.Marshal(keys)
	if err != nil {
		return err
	}
	file.Write(writeBuffer)

	s.Keys = keys
	return nil
}
