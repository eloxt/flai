// ==========================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// ==========================================================================

package internal

import (
	"context"

	"github.com/gogf/gf/v2/database/gdb"
	"github.com/gogf/gf/v2/frame/g"
)

// McpDao is the data access object for the table mcp.
type McpDao struct {
	table    string             // table is the underlying table name of the DAO.
	group    string             // group is the database configuration group name of the current DAO.
	columns  McpColumns         // columns contains all the column names of Table for convenient usage.
	handlers []gdb.ModelHandler // handlers for customized model modification.
}

// McpColumns defines and stores column names for the table mcp.
type McpColumns struct {
	Id             string //
	UserId         string //
	Name           string //
	ConnectionType string //
	Endpoint       string //
	Headers        string //
	Tools          string //
	CreatedAt      string //
	UpdatedAt      string //
	DeletedAt      string //
	IsActive       string //
}

// mcpColumns holds the columns for the table mcp.
var mcpColumns = McpColumns{
	Id:             "id",
	UserId:         "user_id",
	Name:           "name",
	ConnectionType: "connection_type",
	Endpoint:       "endpoint",
	Headers:        "headers",
	Tools:          "tools",
	CreatedAt:      "created_at",
	UpdatedAt:      "updated_at",
	DeletedAt:      "deleted_at",
	IsActive:       "is_active",
}

// NewMcpDao creates and returns a new DAO object for table data access.
func NewMcpDao(handlers ...gdb.ModelHandler) *McpDao {
	return &McpDao{
		group:    "default",
		table:    "mcp",
		columns:  mcpColumns,
		handlers: handlers,
	}
}

// DB retrieves and returns the underlying raw database management object of the current DAO.
func (dao *McpDao) DB() gdb.DB {
	return g.DB(dao.group)
}

// Table returns the table name of the current DAO.
func (dao *McpDao) Table() string {
	return dao.table
}

// Columns returns all column names of the current DAO.
func (dao *McpDao) Columns() McpColumns {
	return dao.columns
}

// Group returns the database configuration group name of the current DAO.
func (dao *McpDao) Group() string {
	return dao.group
}

// Ctx creates and returns a Model for the current DAO. It automatically sets the context for the current operation.
func (dao *McpDao) Ctx(ctx context.Context) *gdb.Model {
	model := dao.DB().Model(dao.table)
	for _, handler := range dao.handlers {
		model = handler(model)
	}
	return model.Safe().Ctx(ctx)
}

// Transaction wraps the transaction logic using function f.
// It rolls back the transaction and returns the error if function f returns a non-nil error.
// It commits the transaction and returns nil if function f returns nil.
//
// Note: Do not commit or roll back the transaction in function f,
// as it is automatically handled by this function.
func (dao *McpDao) Transaction(ctx context.Context, f func(ctx context.Context, tx gdb.TX) error) (err error) {
	return dao.Ctx(ctx).Transaction(ctx, f)
}
