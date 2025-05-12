import COS from 'cos-nodejs-sdk-v5';
import { GetAuthorizationCallbackParams } from 'cos-nodejs-sdk-v5';
import * as path from 'path';
import * as fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_API_URL1 = 'https://pages-api.cloud.tencent.com/v1';
const BASE_API_URL2 = 'https://pages-api.edgeone.ai/v1';

let BASE_API_URL = '';

const Authorization = `Bearer ${process.env.EDGEONE_PAGES_API_KEY}`;
const projectName = process.env.EDGEONE_PAGES_PROJECT_NAME;

// Types
interface FileInfo {
  isDir: boolean;
  path: string;
  size: number;
}

interface CosFile {
  Bucket: string;
  Region: string;
  Key: string;
  FilePath: string;
  [key: `x-cos-meta-${string}`]: string;
}

interface CosTempTokenResponse {
  Code: number;
  Data: {
    Response: {
      RequestId: string;
      Bucket: string;
      Region: string;
      TargetPath: string;
      ExpiredTime: number;
      Expiration: string;
      Credentials: {
        Token: string;
        TmpSecretId: string;
        TmpSecretKey: string;
      };
    };
  };
  Message: string;
  RequestId: string;
}

interface ApiResponse<T> {
  Code: number;
  Data: T;
  Message: string;
  RequestId: string;
}

interface Project {
  ProjectId: string;
  Name: string;
  Status: string;
  PresetDomain: string;
  CustomDomains?: Array<{
    Status: string;
    Domain: string;
  }>;
}

interface ProjectsResponse {
  Response: {
    Projects: Project[];
  };
}

interface EncipherTokenResponse {
  Response: {
    Token: string;
    Timestamp: number;
  };
}

interface UploadResult {
  success: boolean;
  targetPath?: string;
  error?: any;
}

// Utility functions
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const checkAndSetBaseUrl = async (): Promise<void> => {
  const res1 = await fetch(`${BASE_API_URL1}`, {
    method: 'POST',
    headers: {
      Authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Action: 'DescribePagesProjects',
      PageNumber: 1,
      PageSize: 10,
    }),
  });

  const res2 = await fetch(`${BASE_API_URL2}`, {
    method: 'POST',
    headers: {
      Authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Action: 'DescribePagesProjects',
      PageNumber: 1,
      PageSize: 10,
    }),
  });

  // Parse responses
  const json1 = await res1.json().catch(() => ({ Code: -1 }));
  const json2 = await res2.json().catch(() => ({ Code: -1 }));

  // Check if either endpoint worked
  if (json1.Code === 0) {
    BASE_API_URL = BASE_API_URL1;
    console.log('Using BASE_API_URL1 endpoint');
  } else if (json2.Code === 0) {
    BASE_API_URL = BASE_API_URL2;
    console.log('Using BASE_API_URL2 endpoint');
  } else {
    // Both endpoints failed
    throw new Error(
      'Invalid EDGEONE_PAGES_API_KEY. Please check your API key. For more information, please refer to https://edgeone.ai/document/177158578324279296'
    );
  }
};

// API functions
/**
 * Get temporary COS token for file uploads
 */
const getCosTempToken = async (): Promise<CosTempTokenResponse> => {
  let body;
  if (projectName) {
    const result = await describePagesProjects({ projectName });
    if (result.Data.Response.Projects.length > 0) {
      body = { ProjectId: result.Data.Response.Projects[0].ProjectId };
    } else {
      throw new Error(`Project ${projectName} not found`);
    }
  } else {
    body = { ProjectName: `local-upload-${Date.now()}` };
  }

  const res = await fetch(`${BASE_API_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization,
    },
    body: JSON.stringify(
      Object.assign(body, { Action: 'DescribePagesCosTempToken' })
    ),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API request failed (${res.status}): ${errorText}`);
  }

  return await res.json();
};

/**
 * Get or create a project
 */
const getOrCreateProject = async (): Promise<ApiResponse<ProjectsResponse>> => {
  if (projectName) {
    const result = await describePagesProjects({ projectName });
    if (result.Data.Response.Projects.length > 0) {
      console.log(
        `[getOrCreateProject] Project ${projectName} already exists. Using existing project.`
      );
      return result;
    }
  }
  console.log(
    `[getOrCreateProject] ProjectName is not provided. Creating new project.`
  );
  return await createPagesProject();
};

/**
 * Create a new pages project
 */
const createPagesProject = async (): Promise<ApiResponse<ProjectsResponse>> => {
  try {
    const res = await fetch(`${BASE_API_URL}`, {
      method: 'POST',
      headers: {
        Authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Action: 'CreatePagesProject',
        Name: projectName || `local-upload-${Date.now()}`,
        Provider: 'Upload',
        Channel: 'Custom',
        Area: 'global',
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API request failed (${res.status}): ${errorText}`);
    }

    const data = await res.json();

    const projectInfo = await describePagesProjects({
      projectId: data?.Data?.Response?.ProjectId,
    });

    return projectInfo;
  } catch (error) {
    console.error('Error creating pages project:', error);
    throw error;
  }
};

/**
 * Describe pages projects
 */
const describePagesProjects = async (opts: {
  projectId?: string;
  projectName?: string;
}): Promise<ApiResponse<ProjectsResponse>> => {
  const { projectId, projectName } = opts;

  const filters = [];
  if (projectId) {
    filters.push({ Name: 'ProjectId', Values: [projectId] });
  }
  if (projectName) {
    filters.push({ Name: 'Name', Values: [projectName] });
  }

  const res = await fetch(`${BASE_API_URL}`, {
    method: 'POST',
    headers: {
      Authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Action: 'DescribePagesProjects',
      Filters: filters,
      Offset: 0,
      Limit: 10,
      OrderBy: 'CreatedOn',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API request failed (${res.status}): ${errorText}`);
  }

  return await res.json();
};

/**
 * Describe pages deployments
 */
const describePagesDeployments = async (
  projectId: string
): Promise<ApiResponse<any>> => {
  const res = await fetch(`${BASE_API_URL}`, {
    method: 'POST',
    headers: {
      Authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Action: 'DescribePagesDeployments',
      ProjectId: projectId,
      Offset: 0,
      Limit: 50,
      OrderBy: 'CreatedOn',
      Order: 'Desc',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API request failed (${res.status}): ${errorText}`);
  }

  return await res.json();
};

/**
 * Describe pages encipher token
 */
const describePagesEncipherToken = async (
  url: string
): Promise<ApiResponse<EncipherTokenResponse>> => {
  const res = await fetch(`${BASE_API_URL}`, {
    method: 'POST',
    headers: {
      Authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Action: 'DescribePagesEncipherToken',
      Text: url,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API request failed (${res.status}): ${errorText}`);
  }

  return await res.json();
};

/**
 * Check if a path is a zip file
 */
const isZipFile = (filePath: string): boolean => {
  return path.extname(filePath).toLowerCase() === '.zip';
};

/**
 * Create a new deployment
 */
const createPagesDeployment = async (opts: {
  projectId: string;
  targetPath: string;
  isZip: boolean;
}): Promise<ApiResponse<any>> => {
  const { projectId, targetPath, isZip } = opts;

  const res = await fetch(`${BASE_API_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization,
    },
    body: JSON.stringify({
      Action: 'CreatePagesDeployment',
      ProjectId: projectId,
      ViaMeta: 'Upload',
      Provider: 'Upload',
      Env: 'Production',
      DistType: isZip ? 'Zip' : 'Folder',
      TempBucketPath: targetPath,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `[createPagesDeployment] API request failed (${res.status}): ${errorText}`
    );
  }

  const data = await res.json();


  if (data?.Data?.Response?.Error) {
    throw new Error(
      `[createPagesDeployment] Deployment creation failed: ${data.Data.Response.Error.Message}`
    );
  }

  return data;
};

// COS (Cloud Object Storage) functions
// Initialize COS with dynamic authentication
const cos = new COS({
  getAuthorization: async function (_options, callback) {
    try {
      const result = await getCosTempToken();
      if (
        result.Code !== 0 ||
        !result.Data ||
        !result.Data.Response ||
        !result.Data.Response.Credentials
      ) {
        console.error('Failed to get COS temp token', result);
        return callback({} as GetAuthorizationCallbackParams);
      }

      const response = result.Data.Response;
      const credentials = response.Credentials;

      callback({
        TmpSecretId: credentials.TmpSecretId,
        TmpSecretKey: credentials.TmpSecretKey,
        SecurityToken: credentials.Token,
        StartTime: Math.floor(Date.now() / 1000), // Current time in seconds
        ExpiredTime: response.ExpiredTime,
        ScopeLimit: true,
      });
    } catch (error) {
      console.error('Error getting COS temp token:', error);
      callback({} as GetAuthorizationCallbackParams);
    }
  },
});

/**
 * Recursively list all files in a directory
 */
const fastListFolder = async (rootPath: string): Promise<FileInfo[]> => {
  const list: FileInfo[] = [];

  const deep = async (dirPath: string): Promise<void> => {
    const files = await fs.readdir(dirPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      const isDir = file.isDirectory();
      const stats = await fs.stat(filePath);

      list.push({
        isDir,
        path: isDir ? `${filePath}/` : filePath,
        size: isDir ? 0 : stats.size,
      });

      if (isDir) {
        await deep(filePath);
      }
    }
  };

  try {
    await deep(rootPath);
    if (list.length > 1000000) {
      throw new Error('too_much_files');
    }
    return list;
  } catch (error) {
    console.error('Error in fastListFolder:', error);
    throw error;
  }
};

/**
 * Convert file list to COS format
 */
const getFiles = (
  list: FileInfo[],
  localFolder: string,
  bucket: string,
  region: string,
  targetPath: string
): CosFile[] => {
  return list
    .map((file) => {
      const filename = path
        .relative(localFolder, file.path)
        .replace(/\\/g, '/');
      const Key = `${targetPath}/${filename || ''}`;
      return {
        Bucket: bucket,
        Region: region,
        Key,
        FilePath: file.path,
      };
    })
    .filter((file) => {
      if (file.FilePath.endsWith('/')) {
        return false;
      }
      if (file.Key === '/' || file.Key === '') {
        return false;
      }
      return true;
    });
};

/**
 * Upload files to COS
 */
const uploadFiles = async (files: CosFile[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    cos.uploadFiles(
      {
        files: files,
        SliceSize: 1024 * 1024,
      },
      function (err, data) {
        // console.log('data', JSON.stringify(data));
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      }
    );
  });
};

/**
 * Upload directory to COS
 */
const uploadDirectoryToCOS = async (
  localPath: string
): Promise<UploadResult> => {
  try {
    const tokenResult = await getCosTempToken();
    if (tokenResult.Code !== 0 || !tokenResult?.Data?.Response) {
      throw new Error(
        `Failed to get COS token: ${
          tokenResult.Message || 'Invalid token response'
        }`
      );
    }

    const response = tokenResult.Data.Response;
    const bucket = response.Bucket;
    const region = response.Region;
    const targetPath = response.TargetPath;

    if (!bucket || !region || !targetPath) {
      throw new Error(
        'Missing required COS parameters (Bucket, Region, TargetPath) in token response.'
      );
    }

    const isZip = isZipFile(localPath);

    if (isZip) {
      // Upload single zip file to COS
      console.log(
        `[uploadDirectoryToCOS] Uploading zip file to COS bucket ${bucket} in region ${region} at path ${targetPath}...`
      );

      const fileName = path.basename(localPath);
      const key = `${targetPath}/${fileName}`;

      // Read the file data
      const fileBuffer = await fs.readFile(localPath);
      const fileStats = await fs.stat(localPath);

      return new Promise((resolve, reject) => {
        cos.putObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
            Body: fileBuffer,
            ContentLength: fileStats.size,
          },
          function (err, data) {
            // console.log('data', data);
            if (err) {
              console.error('Error uploading zip file to COS:', err);
              reject(err);
            } else {
              console.log(`[uploadDirectoryToCOS] Zip file upload complete.`);
              resolve({
                success: true,
                targetPath: key,
              });
            }
          }
        );
      });
    } else {
      // List all files in the directory
      const folderList = await fastListFolder(localPath);

      // Convert to COS format
      const files = getFiles(folderList, localPath, bucket, region, targetPath);

      // Upload files to COS
      console.log(
        `[uploadDirectoryToCOS] Uploading ${files.length} files to COS bucket ${bucket} in region ${region} at path ${targetPath}...`
      );
      await uploadFiles(files);
      console.log(`[uploadDirectoryToCOS] COS upload complete.`);

      return {
        success: true,
        targetPath,
      };
    }
  } catch (error) {
    console.error('Error uploading to COS:', error);
    throw error;
  }
};

/**
 * Poll for project status until it's no longer processing
 */
const pollProjectStatus = async (
  projectId: string
): Promise<ApiResponse<ProjectsResponse>> => {
  let isProcessing = true;
  let statusResult = await describePagesProjects({
    projectId: projectId,
  });

  while (isProcessing) {
    console.log(
      `[pollProjectStatus] Project status: ${statusResult.Data.Response.Projects[0].Status}`
    );

    const status = statusResult.Data.Response.Projects[0].Status;
    if (status !== 'Process') {
      isProcessing = false;
    } else {
      // Wait 2 seconds before next poll
      await sleep(2000);
      statusResult = await describePagesProjects({
        projectId: projectId,
      });
    }
  }

  return statusResult;
};

/**
 * Validate that the path exists and is a directory or zip file
 */
const validateFolder = async (localPath: string): Promise<boolean> => {
  try {
    await fs.access(localPath);
  } catch (error) {
    throw new Error('localPath does not exist');
  }

  const stats = await fs.stat(localPath);
  const isZip = isZipFile(localPath);

  if (!stats.isDirectory() && !isZip) {
    throw new Error('localPath must be a folder or zip file');
  }

  return isZip;
};

/**
 * Get structured deployment result
 * @param projectStatusResult The result from polling project status
 * @returns Structured deployment result with type and url
 */
const getDeploymentStructuredResult = async (
  projectStatusResult: ApiResponse<ProjectsResponse>
): Promise<{ type: string; url: string }> => {
  if (!projectStatusResult?.Data?.Response?.Projects?.[0]) {
    throw new Error('Failed to retrieve project status information.');
  }

  const project = projectStatusResult.Data.Response.Projects[0];

  if (project.Status === 'Normal') {
    if (project.CustomDomains && project.CustomDomains.length > 0) {
      const customDomain = project.CustomDomains[0];
      if (customDomain.Status === 'Pass') {
        return {
          type: 'custom',
          url: `https://${customDomain.Domain}`,
        };
      }
    }

    console.log(`[getDeploymentStructuredResult] Deployment status is Normal.`);
    console.log(
      `[getDeploymentStructuredResult] Fetching encipher token for domain: ${project.PresetDomain}`
    );
    const encipherTokenResult = await describePagesEncipherToken(
      project.PresetDomain
    );
    if (
      encipherTokenResult.Code !== 0 ||
      !encipherTokenResult?.Data?.Response?.Token ||
      !encipherTokenResult?.Data?.Response?.Timestamp
    ) {
      throw new Error(
        `Deployment completed, but failed to get access token: ${
          encipherTokenResult.Message || 'Invalid token data'
        }`
      );
    }
    const { Token, Timestamp } = encipherTokenResult.Data.Response;
    const url = `https://${project.PresetDomain}?eo_token=${Token}&eo_time=${Timestamp}`;
    return {
      type: 'temporary',
      url: url,
    };
  } else {
    console.log(
      `[getDeploymentStructuredResult] Deployment failed with status: ${project.Status}`
    );
    throw new Error(`Deployment failed with status: ${project.Status}`);
  }
};

/**
 * Format deployment result into user-friendly message
 * @param deploymentResult The structured deployment result
 * @returns Text message describing the deployment status
 */
const formatDeploymentMessage = async (deploymentResult: {
  type: string;
  url: string;
}): Promise<string> => {
  const res = await fetch('https://proxy.edgeone.site/mcp-format', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deploymentResult),
  });

  const { text } = await res.json();
  return text;
};

/**
 * Deploy a local folder or zip file to EdgeOne Pages
 * @param localPath Path to the local folder or zip file to deploy
 * @returns URL to the deployed site
 */
export const deployFolderOrZipToEdgeOne = async (
  localPath: string
): Promise<string> => {
  // Validate folder or zip file
  const isZip = await validateFolder(localPath);

  await checkAndSetBaseUrl();

  // 1. Upload folder to COS
  console.log(
    `[uploadDirectoryToCOS] Uploading ${
      isZip ? 'zip file' : 'folder'
    } to COS...`
  );
  const uploadResult = await uploadDirectoryToCOS(localPath);
  if (!uploadResult.targetPath) {
    throw new Error('COS upload succeeded but targetPath is missing.');
  }
  const targetPath = uploadResult.targetPath;
  console.log(
    `[uploadDirectoryToCOS] ${
      isZip ? 'Zip file' : 'Folder'
    } uploaded to COS target path: ${targetPath}`
  );

  // 2. Get or create project
  console.log(`[getOrCreateProject] Getting or creating project...`);
  const projectResult = await getOrCreateProject();
  if (!projectResult?.Data?.Response?.Projects?.[0]?.ProjectId) {
    console.error('Invalid project data received:', projectResult);
    throw new Error('Failed to retrieve Project ID after get/create.');
  }
  const projectId = projectResult.Data.Response.Projects[0].ProjectId;
  console.log(`[getOrCreateProject] Using Project ID: ${projectId}`);

  // 3. Create deployment
  console.log(`[createPagesDeployment] Creating deployment...`);
  await createPagesDeployment({
    projectId,
    targetPath: targetPath,
    isZip,
  });

  // 4. Wait for deployment to complete
  console.log(
    `[pollProjectStatus] Waiting for deployment to complete (polling status)...`
  );
  await sleep(5000);
  const projectStatusResult = await pollProjectStatus(projectId);

  // 5. Get structured deployment result and format message
  const structuredResult = await getDeploymentStructuredResult(
    projectStatusResult
  );
  const text = await formatDeploymentMessage(structuredResult);
  return text;
};
