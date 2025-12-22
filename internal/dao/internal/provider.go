// ==========================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// ==========================================================================

package internal

import (
	"context"

	"github.com/gogf/gf/v2/database/gdb"
	"github.com/gogf/gf/v2/frame/g"
)

// ProviderDao is the data access object for the table provider.
type ProviderDao struct {
	table    string             // table is the underlying table name of the DAO.
	group    string             // group is the database configuration group name of the current DAO.
	columns  ProviderColumns    // columns contains all the column names of Table for convenient usage.
	handlers []gdb.ModelHandler // handlers for customized model modification.
}

// ProviderColumns defines and stores column names for the table provider.
type ProviderColumns struct {
	Id           string //
	Name         string //
	ApiKey       string //
	ProviderType string //
	BaseUrl      string //
	Model        string //
	IsActive     string //
	CreatedAt    string //
	UpdatedAt    string //
	DeletedAt    string //
}

// providerColumns holds the columns for the table provider.
var providerColumns = ProviderColumns{
	Id:           "id",
	Name:         "name",
	ApiKey:       "api_key",
	ProviderType: "provider_type",
	BaseUrl:      "base_url",
	Model:        "model",
	IsActive:     "is_active",
	CreatedAt:    "created_at",
	UpdatedAt:    "updated_at",
	DeletedAt:    "deleted_at",
}

// NewProviderDao creates and returns a new DAO object for table data access.
func NewProviderDao(handlers ...gdb.ModelHandler) *ProviderDao {
	return &ProviderDao{
		group:    "default",
		table:    "provider",
		columns:  providerColumns,
		handlers: handlers,
	}
}

// DB retrieves and returns the underlying raw database management object of the current DAO.
func (dao *ProviderDao) DB() gdb.DB {
	return g.DB(dao.group)
}

// Table returns the table name of the current DAO.
func (dao *ProviderDao) Table() string {
	return dao.table
}

// Columns returns all column names of the current DAO.
func (dao *ProviderDao) Columns() ProviderColumns {
	return dao.columns
}

// Group returns the database configuration group name of the current DAO.
func (dao *ProviderDao) Group() string {
	return dao.group
}

// Ctx creates and returns a Model for the current DAO. It automatically sets the context for the current operation.
func (dao *ProviderDao) Ctx(ctx context.Context) *gdb.Model {
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
func (dao *ProviderDao) Transaction(ctx context.Context, f func(ctx context.Context, tx gdb.TX) error) (err error) {
	return dao.Ctx(ctx).Transaction(ctx, f)
}
