package main

import (
	_ "flai/internal/packed"

	"github.com/gogf/gf/v2/os/gctx"

	"flai/internal/cmd"
)

func main() {
	cmd.Main.Run(gctx.GetInitCtx())
}
