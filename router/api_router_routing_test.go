package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestUserCreditGrantsRouteDoesNotMatchUserIdParamRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	apiRouter := router.Group("/api")
	userRoute := apiRouter.Group("/user")

	selfRoute := userRoute.Group("/")
	selfRoute.GET("/credit_grants", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	adminRoute := userRoute.Group("/")
	adminRoute.GET("/:id", func(c *gin.Context) {
		c.Status(http.StatusTeapot)
	})

	request := httptest.NewRequest(http.MethodGet, "/api/user/credit_grants", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected %d, got %d", http.StatusOK, response.Code)
	}
}

func TestApiRouterRegistersSelfCreditGrantsEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	SetApiRouter(router)

	found := false
	for _, route := range router.Routes() {
		if route.Method == http.MethodGet && route.Path == "/api/user/credit_grants" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected route GET /api/user/credit_grants to be registered")
	}
}

func TestApiRouterHandlesCorsPreflight(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("CORS_ALLOW_ORIGINS", "")

	router := gin.New()
	SetApiRouter(router)

	request := httptest.NewRequest(http.MethodOptions, "/api/user/login", nil)
	request.Header.Set("Origin", "https://example.com")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	request.Header.Set("Access-Control-Request-Headers", "content-type,authorization")

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected %d, got %d", http.StatusNoContent, response.Code)
	}
	if response.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Fatalf("expected Access-Control-Allow-Origin to be set")
	}
}
