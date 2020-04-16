const axios = require('axios');
const https = require('https');
const fs = require('fs');
const extract = require('extract-zip');
const { Response, JobStatus, Log } = require('@saagie/sdk');

/**
 * Logic to start the external job instance.
 * @param {Object} params
 * @param {Object} params.job - Contains job data including featuresValues.
 * @param {Object} params.instance - Contains instance data.
 */
exports.start = async ({ job, instance }) => {
  try {
    console.log({ job });
    console.log('START INSTANCE:', instance);
    const agent = new https.Agent({  
      rejectUnauthorized: false
    });

    const parameters = [];

    if (job.featuresValues.first_parameter_key && job.featuresValues.first_parameter_value) {
      parameters.push({
        key: job.featuresValues.first_parameter_key,
        value: job.featuresValues.first_parameter_value
      });
    }

    if (job.featuresValues.second_parameter_key && job.featuresValues.second_parameter_value) {
      parameters.push({
        key: job.featuresValues.second_parameter_key,
        value: job.featuresValues.second_parameter_value
      });
    }

    const { data } = await axios.post(
      `${job.featuresValues.endpoint.url}/v4/jobGroups`,
      {
        wrangledDataset: {
          id: job.featuresValues.dataset.id,
        },
        runParameters: {
          overrides: {
            data: parameters
          }
        }
      },
      {
        httpsAgent: agent,
        auth: {
          username: job.featuresValues.endpoint.mail,
          password: job.featuresValues.endpoint.password
        }
      }
    );

    // You can return any payload you want to get in the stop and getStatus functions.
    return Response.success({ jobGroupId: data.id });
  } catch (error) {
    return Response.error('Fail to start job', { error });
  }
};

/**
 * Logic to stop the external job instance.
 * @param {Object} params
 * @param {Object} params.job - Contains job data including featuresValues.
 * @param {Object} params.instance - Contains instance data including the payload returned in the start function.
 */
exports.stop = async ({ job, instance }) => {
  try {
    console.log('STOP INSTANCE:', instance);
    await axios.delete(
      `${job.featuresValues.endpoint.url}/v4/jobGroups/${instance.payload.jobGroupId}`,
      {
        auth: {
          username: job.featuresValues.endpoint.mail,
          password: job.featuresValues.endpoint.password
        }
      }
    );

    return Response.success();
  } catch (error) {
    return Response.error('Fail to stop job', { error });
  }
};

/**
 * Logic to retrieve the external job instance status.
 * @param {Object} params
 * @param {Object} params.job - Contains job data including featuresValues.
 * @param {Object} params.instance - Contains instance data including the payload returned in the start function.
 */
exports.getStatus = async ({ job, instance }) => {
  try {
    console.log('GET STATUS INSTANCE:', instance);
    const agent = new https.Agent({  
      rejectUnauthorized: false
    });

    const { data } = await axios.get(
      `${job.featuresValues.endpoint.url}/v4/jobGroups/${instance.payload.jobGroupId}/status`,
      {
        httpsAgent: agent,
        auth: {
          username: job.featuresValues.endpoint.mail,
          password: job.featuresValues.endpoint.password
        }
      }
    );

    switch (data) {
      case 'Created':
        return Response.success(JobStatus.QUEUED);
      case 'Pending':
        return Response.success(JobStatus.QUEUED);
      case 'InProgress':
        return Response.success(JobStatus.RUNNING);
      case 'Complete':
        return Response.success(JobStatus.SUCCEEDED);
      case 'Canceled':
        return Response.success(JobStatus.KILLED);
      case 'Failed':
        return Response.success(JobStatus.FAILED);
      default:
        return Response.success(JobStatus.AWAITING);
    }
  } catch (error) {
    return Response.error(`Failed to get status for dataset ${job.featuresValues.dataset.id}`, { error });
  }
};

/**
 * Logic to retrieve the external job instance logs.
 * @param {Object} params
 * @param {Object} params.job - Contains job data including featuresValues.
 * @param {Object} params.instance - Contains instance data including the payload returned in the start function.
 */
exports.getLogs = async ({ job, instance }) => {
  try {
    console.log('GET LOG INSTANCE:', instance);
    const agent = new https.Agent({  
      rejectUnauthorized: false
    });

    console.log(`${job.featuresValues.endpoint.url}/v4/jobGroups/${instance.payload.jobGroupId}/logs`);
    
    const result = await axios.get(
      `${job.featuresValues.endpoint.url}/v4/jobGroups/${instance.payload.jobGroupId}/logs`,
      {
        httpsAgent: agent,
        auth: {
          username: job.featuresValues.endpoint.mail,
          password: job.featuresValues.endpoint.password
        },
        responseType: 'arraybuffer'
      }
    );

    const jobLogsFilePath = `/tmp/job-${instance.payload.jobGroupId}-logs.zip`;
    const jobLogsFolderPath = `/tmp/job-${instance.payload.jobGroupId}-logs`;

    const { data } = result;

    fs.appendFileSync(jobLogsFilePath, data);

    await extract(jobLogsFilePath, { dir: '/tmp' });

    const directories = fs.readdirSync(jobLogsFolderPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .filter(dirName => Number(dirName));

    console.log({ directories });

    let logs = '';

    directories.forEach((dir) => {
      const newLogs = fs.readFileSync(`${jobLogsFolderPath}/${dir}/job.log`, 'utf8');
      logs += '\n' + newLogs;
    });

    const logsLines = logs.split('\n');

    console.log({ logsLines });

    return Response.success(logsLines.map((line) => Log(line)));
  } catch (error) {
    console.error({ error });
    return Response.error(`Failed to get log for dataset ${job.featuresValues.dataset.id}`, { error });
  }
};