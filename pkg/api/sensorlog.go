package api

import (
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/cedbossneo/openmower-gui/pkg/providers"
	"github.com/gin-gonic/gin"
)

func SensorLogRoutes(r *gin.RouterGroup, provider *providers.SensorLogProvider) {
	group := r.Group("/sensorlog")

	// GET /api/sensorlog — query sensor data
	group.GET("", func(c *gin.Context) {
		if provider == nil {
			c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "sensor log not initialized"})
			return
		}

		now := time.Now().Unix()
		from := now - 86400 // default: last 24h
		to := now
		sensor := "rpm"
		limit := 50000

		if v := c.Query("from"); v != "" {
			if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
				from = parsed
			}
		}
		if v := c.Query("to"); v != "" {
			if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
				to = parsed
			}
		}
		if v := c.Query("sensor"); v != "" {
			sensor = v
		}
		if v := c.Query("limit"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil {
				limit = parsed
			}
		}

		result, err := provider.QuerySamples(from, to, sensor, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
			return
		}
		c.JSON(http.StatusOK, result)
	})

	// GET /api/sensorlog/stats — summary statistics
	group.GET("/stats", func(c *gin.Context) {
		if provider == nil {
			c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "sensor log not initialized"})
			return
		}

		stats, err := provider.GetStats()
		if err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
			return
		}
		c.JSON(http.StatusOK, stats)
	})

	// POST /api/sensorlog/seed — insert mock data (dev only)
	group.POST("/seed", func(c *gin.Context) {
		if os.Getenv("DEV_MODE") != "true" {
			c.JSON(http.StatusForbidden, ErrorResponse{Error: "seed endpoint only available in dev mode"})
			return
		}
		if provider == nil {
			c.JSON(http.StatusServiceUnavailable, ErrorResponse{Error: "sensor log not initialized"})
			return
		}

		count := 3600
		if v := c.Query("count"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil {
				count = parsed
			}
		}

		if err := provider.SeedMockData(count); err != nil {
			c.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
			return
		}
		c.JSON(http.StatusOK, OkResponse{Ok: "seeded " + strconv.Itoa(count) + " samples"})
	})
}
