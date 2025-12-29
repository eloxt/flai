package s3

import (
	"context"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/os/gcfg"
)

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

func (c *Client) UploadFile(ctx context.Context, key string, content io.Reader) error {
	_, err := c.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
		Body:   content,
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
