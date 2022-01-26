const { exec } = require('child_process');
const rimraf_lib = require('rimraf');
const aws_sdk = require('aws-sdk');
const { join } = require('path');
const { createReadStream } = require('fs');
const config = require('./config.js');
const zip_folder_lib = require('zip-folder');
var cron = require('node-cron');

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

    return 'done';
}

main()
    .then(() => console.log('-------- done --------'))
    .catch((err) => console.log(err));
// cron.schedule('0 0 0 * * *', () => {
// });

