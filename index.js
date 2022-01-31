const { exec } = require('child_process');
const rimraf_lib = require('rimraf');
const aws_sdk = require('aws-sdk');
const { join } = require('path');
const { createReadStream } = require('fs');
const config = require('./config.js');
const zip_folder_lib = require('zip-folder');
var cron = require('node-cron');
const { PromiseResult } = require('aws-sdk/lib/request');

/**
 * 
 * @param {string} cmd 
 * @returns {Promise<string>}
 */
function execute(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            stdout;
            stderr;
            if (error) {
                reject(error);
            } else {
                resolve('done');
            }
        });
    });
}

/**
 * 
 * @param {string[]} folder
 * @param {string[]} file 
 * @returns {Promise<string>}
 */
function zip_folder(folder, file) {
    return new Promise((resolve, reject) => {
        const folderPath = join(...folder);
        const filePath = join(...file);
        zip_folder_lib(folderPath, filePath, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve('done');
            }
        });
    });
}

/**
 * 
 * @param {string[]} path 
 * @returns {Promise<string>}
 */
function rimraf(path) {
    return new Promise((resolve, reject) => {
        const filePath = join(...path);
        rimraf_lib(filePath, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve('done');
            }
        });
    });
}

/**
 * 
 * @param {string[]} path 
 * @returns {Promise<aws_sdk.S3.ManagedUpload.SendData>}
 */
function uploadFile(path) {
    return new Promise((resolve, reject) => {
        const filePath = join(...path);
        const fileStream = createReadStream(filePath);
        const uploadParams = {
            Bucket: config.s3.bucket,
            Key: join('Backup', 'postgres', filePath),
            Body: fileStream,
        };

        aws_sdk.config.update({
            region: config.s3.region,
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
        });

        const s3 = new aws_sdk.S3({ apiVersion: config.s3.apiVersion });

        s3.upload(
            uploadParams,
            (err, data) => {
                if (err) {
                    console.log(err);
                    reject(err);
                } else if (data) {
                    resolve(data);
                }
            }
        );
    });
}

/**
 * 
 * @param {string} filename
 * @returns {Promise<string>}
 */
function postgres_dump(filename) {
    const cmd = [
        `PGPASSWORD="${config.database.pass}"`,
        'pg_dumpall',
        '-h postgres',
        '-U postgres',
        '-p 5432',
        '>',
        filename
    ].join(' ');
    return execute(cmd);
}

/**
 * 
 * @param {string} prefix 
 * @returns {Promise<PromiseResult<aws_sdk.S3.ListObjectsOutput, aws_sdk.AWSError>>}
 */
 function listFilesS3(
    prefix
) {
    const s3 = new aws_sdk.S3({ apiVersion: config.s3.apiVersion });
    return s3
        .listObjects({
            Bucket: config.s3.bucket,
            Prefix: prefix,
        })
        .promise();
}

/**
 * 
 * @param {string} key 
 * @returns {Promise<PromiseResult<aws_sdk.S3.DeleteObjectOutput, aws_sdk.AWSError>>}
 */
function deleteFileS3(
    key
) {
    const s3 = new aws_sdk.S3({ apiVersion: environment.aws.apiVersion });
    return s3
        .deleteObject({ Bucket: environment.aws.bucket, Key: key })
        .promise();
}


/**
 * 
 * @returns {Promise<string>}
 */
async function main() {
    console.log('-------- start dump --------');
    const date = new Date();
    const fileName = [
        'dump',
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes()
    ].join('-') + '.bak';
    await postgres_dump(fileName);
    console.log('-------- dump done --------');

    console.log('-------- start zip folder --------');
    await execute('mkdir ./dump');
    await execute(`mv ./${fileName} ./dump/${fileName} `);
    await zip_folder(['dump'], [fileName + '.zip']);
    console.log('-------- zip folder done --------');

    console.log('-------- start upload --------');
    await uploadFile([fileName + '.zip']);
    console.log('-------- upload done --------');

    console.log('-------- start clear --------');
    await rimraf(['dump']);
    await rimraf([fileName + '.zip']);
    console.log('-------- clear done --------');

    console.log('-------- start clear old backup --------');
    const list = await listFilesS3('Backup/postgres');

    if (Array.isArray(list)) {
      if (list.length > 5) {
        const sort = list.sort((a, b) => {
          const aDate = new Date(a?.LastModified ?? '');
          const bDate = new Date(b?.LastModified ?? '');
          if (aDate > bDate) {
            return 1;
          } else {
            return -1;
          }
        });

        if (sort[0]?.Key) {
          await deleteFileS3(sort[0]?.Key);
        }
      }
    }

    console.log('-------- clear old backup done --------');

    return 'done';
}

cron.schedule('0 0 0 * * *', () => {
    main()
        .then(() => console.log('-------- done --------'))
        .catch((err) => console.log(err));
});

