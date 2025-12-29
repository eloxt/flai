// ==========================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// ==========================================================================

package internal

import (
	"context"

	"github.com/gogf/gf/v2/database/gdb"
	"github.com/gogf/gf/v2/frame/g"
)

// FileDao is the data access object for the table file.
type FileDao struct {
	table    string             // table is the underlying table name of the DAO.
	group    string             // group is the database configuration group name of the current DAO.
	columns  FileColumns        // columns contains all the column names of Table for convenient usage.
	handlers []gdb.ModelHandler // handlers for customized model modification.
}

// FileColumns defines and stores column names for the table file.
type FileColumns struct {
	Id        string //
	UserId    string //
	Hash      string //
	FileName  string //
	MimeType  string //
	Size      string //
	Path      string //
	CreatedAt string //
	PublicUrl string //
}

// fileColumns holds the columns for the table file.
var fileColumns = FileColumns{
	Id:        "id",
	UserId:    "user_id",
	Hash:      "hash",
	FileName:  "file_name",
	MimeType:  "mime_type",
	Size:      "size",
	Path:      "path",
	CreatedAt: "created_at",
	PublicUrl: "public_url",
}

// NewFileDao creates and returns a new DAO object for table data access.
func NewFileDao(handlers ...gdb.ModelHandler) *FileDao {
	return &FileDao{
		group:    "default",
		table:    "file",
		columns:  fileColumns,
		handlers: handlers,
	}
}

// DB retrieves and returns the underlying raw database management object of the current DAO.
func (dao *FileDao) DB() gdb.DB {
	return g.DB(dao.group)
}

// Table returns the table name of the current DAO.
func (dao *FileDao) Table() string {
	return dao.table
}

// Columns returns all column names of the current DAO.
func (dao *FileDao) Columns() FileColumns {
	return dao.columns
}

// Group returns the database configuration group name of the current DAO.
func (dao *FileDao) Group() string {
	return dao.group
}

// Ctx creates and returns a Model for the current DAO. It automatically sets the context for the current operation.
func (dao *FileDao) Ctx(ctx context.Context) *gdb.Model {
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
func (dao *FileDao) Transaction(ctx context.Context, f func(ctx context.Context, tx gdb.TX) error) (err error) {
	return dao.Ctx(ctx).Transaction(ctx, f)
}
