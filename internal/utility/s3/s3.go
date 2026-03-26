package s3

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/os/gcfg"
)

var extensionToContentType = map[string]string{
	".txt":   "text/plain",
	".html":  "text/html",
	".css":   "text/css",
	".js":    "application/javascript",
	".json":  "application/json",
	".xml":   "application/xml",
	".pdf":   "application/pdf",
	".zip":   "application/zip",
	".tar":   "application/x-tar",
	".gz":    "application/gzip",
	".png":   "image/png",
	".jpg":   "image/jpeg",
	".jpeg":  "image/jpeg",
	".gif":   "image/gif",
	".svg":   "image/svg+xml",
	".webp":  "image/webp",
	".ico":   "image/x-icon",
	".mp3":   "audio/mpeg",
	".mp4":   "video/mp4",
	".webm":  "video/webm",
	".woff":  "font/woff",
	".woff2": "font/woff2",
	".ttf":   "font/ttf",
	".eot":   "application/vnd.ms-fontobject",
	".doc":   "application/msword",
	".docx":  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls":   "application/vnd.ms-excel",
	".xlsx":  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".ppt":   "application/vnd.ms-powerpoint",
	".pptx":  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

type Client struct {
	client *s3.Client
	bucket string
}

func New(ctx context.Context) (*Client, error) {
	endpoint := gcfg.Instance().MustGet(ctx, "s3.endpoint").String()
	region := gcfg.Instance().MustGet(ctx, "s3.region").String()
	accessKey := gcfg.Instance().MustGet(ctx, "s3.accessKey").String()
	secretKey := gcfg.Instance().MustGet(ctx, "s3.secretKey").String()
	bucket := gcfg.Instance().MustGet(ctx, "s3.bucket").String()

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return nil, gerror.Wrap(err, "failed to load aws config")
	}

	return &Client{
		client: s3.NewFromConfig(cfg, func(options *s3.Options) {
			options.BaseEndpoint = aws.String(endpoint)
		}),
		bucket: bucket,
	}, nil
}

func detectContentType(key string, data []byte) string {
	ext := strings.ToLower(filepath.Ext(key))
	if ct, ok := extensionToContentType[ext]; ok {
		return ct
	}
	if len(data) > 0 {
		return http.DetectContentType(data)
	}
	return "application/octet-stream"
}

func (c *Client) UploadFile(ctx context.Context, key string, content io.Reader) error {
	data, err := io.ReadAll(content)
	if err != nil {
		return gerror.Wrap(err, "failed to read file content")
	}

	contentType := detectContentType(key, data)

	_, err = c.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return gerror.Wrap(err, "failed to upload file to s3")
	}
	return nil
}

func (c *Client) DeleteFile(ctx context.Context, key string) error {
	_, err := c.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return gerror.Wrap(err, "failed to delete file from s3")
	}
	return nil
}

// UploadBytes uploads raw byte data to S3 with the specified content type
func (c *Client) UploadBytes(ctx context.Context, key string, data []byte, contentType string) error {
	_, err := c.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return gerror.Wrap(err, "failed to upload bytes to s3")
	}
	return nil
}

// GetPublicUrl returns the public URL for a given S3 key
func GetPublicUrl(ctx context.Context, key string) string {
	publicUrl := gcfg.Instance().MustGet(ctx, "s3.publicUrl").String()
	if !strings.HasSuffix(publicUrl, "/") {
		publicUrl += "/"
	}
	return publicUrl + key
}
