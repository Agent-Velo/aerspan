package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestLLMEndpointGuard_Defaults(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	authMiddleware := func(c *gin.Context) {
		c.Status(http.StatusUnauthorized)
		c.Abort()
	}

	v1 := router.Group("/v1")
	v1.Use(LLMEndpointGuard())
	v1.Use(authMiddleware)
	v1.POST("/completions", func(c *gin.Context) { c.Status(http.StatusOK) })
	v1.POST("/chat/completions", func(c *gin.Context) { c.Status(http.StatusOK) })
	v1.POST("/embeddings", func(c *gin.Context) { c.Status(http.StatusOK) })
	v1.GET("/realtime", func(c *gin.Context) { c.Status(http.StatusOK) })

	v1betaModels := router.Group("/v1beta/models")
	v1betaModels.Use(LLMEndpointGuard())
	v1betaModels.Use(authMiddleware)
	v1betaModels.GET("", func(c *gin.Context) { c.Status(http.StatusOK) })

	assertStatus := func(method, path string, want int) {
		request := httptest.NewRequest(method, path, nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != want {
			t.Fatalf("%s %s: expected %d, got %d", method, path, want, response.Code)
		}
	}

	// Defaults: allow completions and chat completions.
	assertStatus(http.MethodPost, "/v1/completions", http.StatusUnauthorized)
	assertStatus(http.MethodPost, "/v1/chat/completions", http.StatusUnauthorized)

	// Defaults: disable everything else.
	assertStatus(http.MethodPost, "/v1/embeddings", http.StatusNotFound)
	assertStatus(http.MethodGet, "/v1/realtime", http.StatusNotFound)
	assertStatus(http.MethodGet, "/v1beta/models", http.StatusNotFound)
}

