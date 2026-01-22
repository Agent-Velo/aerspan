package system_setting

var ServerAddress = "http://localhost:3000"

// FrontendBaseUrl is the user-facing website base URL.
// It is used to generate links that users click (e.g. magic links).
var FrontendBaseUrl = ""

// BackendBaseUrl is the API server base URL.
// It is used to generate callback URLs, webhook URLs, etc.
var BackendBaseUrl = ""
var WorkerUrl = ""
var WorkerValidKey = ""
var WorkerAllowHttpImageRequestEnabled = false

func EnableWorker() bool {
	return WorkerUrl != ""
}
