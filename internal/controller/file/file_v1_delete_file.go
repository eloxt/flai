package file

import (
	"context"

	v1 "flai/api/file/v1"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/entity"
	"flai/internal/utility/s3"

	"github.com/gogf/gf/v2/errors/gerror"
)

func (c *ControllerV1) DeleteFile(ctx context.Context, req *v1.DeleteFileReq) (res *v1.DeleteFileRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	deleteIds := req.Ids
	if len(deleteIds) == 0 {
		deleteIds = []string{req.Id}
	}

	var files []*entity.File
	err = dao.File.Ctx(ctx).
		WhereIn(dao.File.Columns().Id, deleteIds).
		Where(dao.File.Columns().UserId, user.Id).
		Scan(&files)
	if err != nil {
		return nil, err
	}

	if len(files) == 0 {
		return nil, gerror.New("File not found")
	}

	// 1. Initialize S3 client once
	s3Client, err := s3.New(ctx)
	if err != nil {
		return nil, err
	}

	// 2. Batch delete from DB
	_, err = dao.File.Ctx(ctx).WhereIn(dao.File.Columns().Id, deleteIds).Delete()
	if err != nil {
		return nil, gerror.Wrap(err, "Failed to delete files from db")
	}

	// 3. Identify unique paths from deleted files
	uniquePaths := make(map[string]struct{})
	var pathsToCheck []string
	for _, file := range files {
		if _, exists := uniquePaths[file.Path]; !exists {
			uniquePaths[file.Path] = struct{}{}
			pathsToCheck = append(pathsToCheck, file.Path)
		}
	}

	// 4. Check for remaining references in one query
	// Find which of these paths still exist in the database
	var existingPathsDetail []*entity.File // Just need paths really, but Scan usually works with struct
	err = dao.File.Ctx(ctx).
		Fields(dao.File.Columns().Path).
		WhereIn(dao.File.Columns().Path, pathsToCheck).
		Distinct().
		Scan(&existingPathsDetail)
	if err != nil {
		return nil, gerror.Wrap(err, "Failed to check file usages")
	}

	// Create a set of paths that are still in use
	stillInUse := make(map[string]struct{})
	for _, f := range existingPathsDetail {
		stillInUse[f.Path] = struct{}{}
	}

	// 5. Delete from S3 only if not in use
	for path := range uniquePaths {
		if _, inUse := stillInUse[path]; !inUse {
			if err := s3Client.DeleteFile(ctx, path); err != nil {
				return nil, err
			}
		}
	}

	return &v1.DeleteFileRes{}, nil
}
