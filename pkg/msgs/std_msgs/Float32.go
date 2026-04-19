package std_msgs

import (
	"github.com/bluenviron/goroslib/v2/pkg/msg"
)

type Float32 struct {
	msg.Package `ros:"std_msgs"`
	Data        float32 `rosname:"data"`
}
