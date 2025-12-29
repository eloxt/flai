package file

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"flai/internal/dao"
	"flai/internal/middleware"
	"flai/internal/model/entity"
	"flai/internal/utility/s3"
	"fmt"
	"io"
	"path/filepath"
	"strings"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/os/gcfg"
	"github.com/gogf/gf/v2/os/gtime"
	"github.com/google/uuid"

	v1 "flai/api/file/v1"
)

func (c *ControllerV1) UploadFile(ctx context.Context, req *v1.UploadFileReq) (res *v1.UploadFileRes, err error) {
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		return nil, gerror.New("User not found")
	}

	file, err := req.File.Open()
	if err != nil {
		return nil, gerror.New("Failed to open file")
	}
	defer file.Close()

	// Calculate hash
	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return nil, gerror.Wrap(err, "Failed to calculate file hash")
	}
	fileHash := hex.EncodeToString(hash.Sum(nil))

	// Check duplication
	var fileKey string
	var existingFile *entity.File
	err = dao.File.Ctx(ctx).Where(dao.File.Columns().Hash, fileHash).Scan(&existingFile)
	if err != nil {
		return nil, gerror.Wrap(err, "Failed to check file duplication")
	}

	fileId := uuid.New().String()

	if existingFile != nil {
		fileKey = existingFile.Path
	} else {
		// Reset file pointer
		if _, err := file.Seek(0, 0); err != nil {
			return nil, gerror.Wrap(err, "Failed to reset file pointer")
		}

		// Upload to S3
		s3Client, err := s3.New(ctx)
		if err != nil {
			return nil, err
		}

		ext := filepath.Ext(req.File.Filename)
		fileKey = fmt.Sprintf("%s/%s%s", user.Id, fileId, ext)

		if err := s3Client.UploadFile(ctx, fileKey, file); err != nil {
			return nil, err
		}
	}

	// Save to DB
	publicUrl := gcfg.Instance().MustGet(ctx, "s3.publicUrl").String()
	if !strings.HasPrefix(publicUrl, "/") {
		publicUrl += "/"
	}
	fileEntity := entity.File{
		Id:        fileId,
		UserId:    user.Id,
		Hash:      fileHash,
		FileName:  req.File.Filename,
		MimeType:  req.File.Header.Get("Content-Type"),
		Size:      int(req.File.Size),
		Path:      fileKey,
		PublicUrl: publicUrl + fileKey,
		CreatedAt: gtime.Now(),
	}

	_, err = dao.File.Ctx(ctx).Data(fileEntity).Insert()
	if err != nil {
		return nil, gerror.Wrap(err, "Failed to save file info to database")
	}

	return &v1.UploadFileRes{
		Id:        fileId,
		FileName:  fileEntity.FileName,
		MimeType:  fileEntity.MimeType,
		Size:      fileEntity.Size,
		Path:      fileEntity.Path,
		PublicUrl: fileEntity.PublicUrl,
		CreatedAt: fileEntity.CreatedAt,
	}, nil
}
