package main

import (
	"os"

	"github.com/cedbossneo/openmower-gui/pkg/api"
	"github.com/cedbossneo/openmower-gui/pkg/providers"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dbProvider := providers.NewDBProvider()
	dockerProvider := providers.NewDockerProvider()
	rosProvider := providers.NewRosProvider(dbProvider)
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/db"
	}
	sensorLogProvider := providers.NewSensorLogProvider(rosProvider, dbPath)
	firmwareProvider := providers.NewFirmwareProvider(dbProvider)
	ubloxProvider := providers.NewUbloxProvider()
	homekitEnabled, err := dbProvider.Get("system.homekit.enabled")
	if err != nil {
		panic(err)
	}
	if string(homekitEnabled) == "true" {
		providers.NewHomeKitProvider(rosProvider, dbProvider)
	}
	mqttEnabled, err := dbProvider.Get("system.mqtt.enabled")
	if err != nil {
		panic(err)
	}
	if string(mqttEnabled) == "true" {
		providers.NewMqttProvider(rosProvider, dbProvider)
	}
	api.NewAPI(dbProvider, dockerProvider, rosProvider, firmwareProvider, ubloxProvider, sensorLogProvider)
}
