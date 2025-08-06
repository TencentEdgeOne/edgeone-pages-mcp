import COS from 'cos-nodejs-sdk-v5';
import * as path from 'path';
import * as fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_API_URL1 = 'https://pages-api.cloud.tencent.com/v1';
const BASE_API_URL2 = 'https://pages-api.edgeone.ai/v1';

let BASE_API_URL = '';

// Console override for logging
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

let deploymentLogs: LogEntry[] = [];
let originalConsole: Console;

const overrideConsole = () => {
  if (!originalConsole) {
    originalConsole = { ...console };
  }

  const createLogFunction = (level: string, originalFn: Function) => {
    return (...args: any[]) => {
      const timestamp = new Date().toISOString();
      const message = args
        .map((arg) =>
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        )
        .join(' ');

      deploymentLogs.push({
        timestamp,
        level,
        message,
      });

      // Call original console function
      originalFn.apply(console, args);
    };
  };

  console.log = createLogFunction('LOG', originalConsole.log);
  console.error = createLogFunction('ERROR', originalConsole.error);
  console.warn = createLogFunction('WARN', originalConsole.warn);
  console.info = createLogFunction('INFO', originalConsole.info);
};

const restoreConsole = () => {
  if (originalConsole) {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
  }
};

const resetLogs = () => {
  deploymentLogs = [];
};

const formatLogs = (): string => {
  if (deploymentLogs.length === 0) {
    return '';
  }

  // Remove duplicates by keeping track of seen messages
  const seenMessages = new Set<string>();
  const uniqueLogs = deploymentLogs.filter((log) => {
    const key = `${log.level}: ${log.message}`;
    if (seenMessages.has(key)) {
      return false;
    }
    seenMessages.add(key);
    return true;
  });

  const logLines = uniqueLogs.map((log) => {
    return `${log.level}: ${log.message}`;
  });

  return `Deployment Process Log:\n${'='.repeat(50)}\n${logLines.join(
    '\n'
  )}\n${'='.repeat(50)}\n\n`;
};

// Export BASE_API_URL for use in other files
export const getBaseApiUrl = () => BASE_API_URL;

// Get API key from environment variable or use argument
const getApiKey = () => {
  return process.env.EDGEONE_PAGES_API_TOKEN;
};

// Get authorization header with API key
export const getAuthorization = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'Missing EDGEONE_PAGES_API_TOKEN. Please provide a token with --token or set it as an environment variable.'
    );
  }
  return `Bearer ${apiKey}`;
};

// Get projectName from environment variable
const getProjectName = () => process.env.EDGEONE_PAGES_PROJECT_NAME || '';

let tempProjectName: string | undefined;

const getTempProjectName = (): string => {
  if (!tempProjectName) {
    tempProjectName = `local-upload-${Date.now()}`;
  }
  return tempProjectName;
};

const resetTempProjectName = (): void => {
  tempProjectName = undefined;
};

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

interface CreatePagesProjectResponse {
  Response: {
    ProjectId: string;
  };
}

interface EncipherTokenResponse {
  Response: {
    Token: string;
    Timestamp: number;
  };
}

interface DeploymentResult {
  DeploymentId: string;
  ProjectId: string;
  Status: string;
  Code: number;
  BuildCost: string;
  ViaMeta: string;
  Env: string;
  RepoBranch: string | null;
  RepoCommitHash: string;
  RepoCommitMsg: string | null;
  PreviewUrl: string;
  CreatedOn: string;
  ModifiedOn: string;
  CoverUrl: string | null;
  UsedInProd: boolean;
  MetaData: string;
  ProjectUrl: string;
}

interface UploadResult {
  success: boolean;
  targetPath?: string;
  error?: any;
}

// Token cache mechanism
interface TokenCache {
  token: CosTempTokenResponse | null;
  cos: COS | null;
}

const tokenCache: TokenCache = {
  token: null,
  cos: null,
};

// Reset token cache
const resetTokenCache = () => {
  tokenCache.token = null;
  tokenCache.cos = null;
};

// Utility functions
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const checkAndSetBaseUrl = async (): Promise<void> => {
  const res1 = await fetch(`${BASE_API_URL1}`, {
    method: 'POST',
    headers: {
      Authorization: getAuthorization(),
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
      Authorization: getAuthorization(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Action: 'DescribePagesProjects',
      PageNumber: 1,
      PageSize: 10,
    }),
  });

  // Parse responses
  const json1 = (await res1
    .json()
    .catch(() => ({ Code: -1 }))) as ApiResponse<ProjectsResponse>;
  const json2 = (await res2
    .json()
    .catch(() => ({ Code: -1 }))) as ApiResponse<ProjectsResponse>;

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
      'Invalid EDGEONE_PAGES_API_TOKEN. Please check your API token. For more information, please refer to https://edgeone.ai/document/177158578324279296'
    );
  }
};

// API functions
/**
 * Get temporary COS token for file uploads
 */
const getCosTempToken = async (): Promise<CosTempTokenResponse> => {
  // Return cached token if available
  if (tokenCache.token) {
    return tokenCache.token;
  }

  let body;
  if (getProjectName()) {
    const result = await describePagesProjects({
      projectName: getProjectName(),
    });
    if (result.Data.Response.Projects.length > 0) {
      body = { ProjectId: result.Data.Response.Projects[0].ProjectId };
    } else {
      throw new Error(`Project ${getProjectName()} not found`);
    }
  } else {
    body = { ProjectName: getTempProjectName() };
  }

  const res = await fetch(`${BASE_API_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthorization(),
    },
    body: JSON.stringify(
      Object.assign(body, { Action: 'DescribePagesCosTempToken' })
    ),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API request failed (${res.status}): ${errorText}`);
  }

  const tokenResponse = (await res.json()) as CosTempTokenResponse;
  // Cache the token
  tokenCache.token = tokenResponse;
  return tokenResponse;
};

/**
 * Get or create a project
 */
const getOrCreateProject = async (): Promise<ApiResponse<ProjectsResponse>> => {
  if (getProjectName()) {
    const result = await describePagesProjects({
      projectName: getProjectName(),
    });
    if (result.Data.Response.Projects.length > 0) {
      console.log(
        `[getOrCreateProject] Project ${getProjectName()} already exists. Using existing project.`
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
        Authorization: getAuthorization(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Action: 'CreatePagesProject',
        Name: getProjectName() || getTempProjectName(),
        Provider: 'Upload',
        Channel: 'Custom',
        Area: 'global',
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API request failed (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as ApiResponse<CreatePagesProjectResponse>;

    const projectInfo = await describePagesProjects({
      projectId: data?.Data?.Response?.ProjectId,
    });

    return projectInfo;
  } catch (error) {
    console.error('Error creating pages project: ' + error);
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
      Authorization: getAuthorization(),
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

  return (await res.json()) as ApiResponse<ProjectsResponse>;
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
      Authorization: getAuthorization(),
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

  return (await res.json()) as ApiResponse<any>;
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
      Authorization: getAuthorization(),
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

  return (await res.json()) as ApiResponse<EncipherTokenResponse>;
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
  env: 'Production' | 'Preview';
}): Promise<ApiResponse<any>> => {
  const { projectId, targetPath, isZip, env } = opts;

  const res = await fetch(`${BASE_API_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthorization(),
    },
    body: JSON.stringify({
      Action: 'CreatePagesDeployment',
      ProjectId: projectId,
      ViaMeta: 'Upload',
      Provider: 'Upload',
      Env: env,
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

  const data = (await res.json()) as ApiResponse<any>;

  if (data?.Data?.Response?.Error) {
    throw new Error(
      `[createPagesDeployment] Deployment creation failed: ${data.Data.Response.Error.Message}`
    );
  }

  return data;
};

// COS (Cloud Object Storage) functions
// Initialize COS with dynamic authentication
const getCosInstance = async (): Promise<COS> => {
  if (tokenCache.cos) {
    return tokenCache.cos;
  }

  const result = await getCosTempToken();
  if (
    result.Code !== 0 ||
    !result.Data ||
    !result.Data.Response ||
    !result.Data.Response.Credentials
  ) {
    throw new Error('Failed to get COS temp token');
  }

  const response = result.Data.Response;
  const credentials = response.Credentials;

  const cos = new COS({
    SecretId: credentials.TmpSecretId,
    SecretKey: credentials.TmpSecretKey,
    SecurityToken: credentials.Token,
  });

  tokenCache.cos = cos;
  return cos;
};

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
    console.error('Error in fastListFolder: ' + error);
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
  const cos = await getCosInstance();
  return new Promise((resolve, reject) => {
    cos.uploadFiles(
      {
        files: files,
        SliceSize: 1024 * 1024,
      },
      function (err, data) {
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
 * Upload a directory or zip file to EdgeOne COS
 */
const uploadToEdgeOneCOS = async (localPath: string): Promise<UploadResult> => {
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
        `[uploadToEdgeOneCOS] Uploading zip file to COS with targetPath: ${targetPath}...`
      );

      const fileName = path.basename(localPath);
      const key = `${targetPath}/${fileName}`;

      // Read the file data
      const fileBuffer = await fs.readFile(localPath);
      const fileStats = await fs.stat(localPath);

      const cos = await getCosInstance();
      return new Promise((resolve, reject) => {
        cos.putObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
            Body: fileBuffer,
            ContentLength: fileStats.size,
          },
          function (err) {
            if (err) {
              console.error('Error uploading zip file to COS: ' + err);
              reject(err);
            } else {
              console.log(`[uploadToEdgeOneCOS] Upload successful.`);
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
        `[uploadToEdgeOneCOS] Uploading ${files.length} files to COS with targetPath: ${targetPath}...`
      );
      await uploadFiles(files);
      console.log(`[uploadToEdgeOneCOS] Upload successful.`);

      return {
        success: true,
        targetPath,
      };
    }
  } catch (error) {
    console.error('Error uploading to COS: ' + error);
    throw error;
  }
};

/**
 * Poll for deployment status until it's no longer processing
 */
const pollProjectStatus = async (
  projectId: string,
  deploymentId: string
): Promise<DeploymentResult> => {
  let isProcessing = true;
  let deployment = null;

  while (isProcessing) {
    // Get list of deployments
    const deploymentsResult = await describePagesDeployments(projectId);

    // Find the specific deployment by deploymentId
    deployment = deploymentsResult.Data.Response.Deployments.find(
      (deploy: any) => deploy.DeploymentId === deploymentId
    );

    if (!deployment) {
      throw new Error(`Deployment with ID ${deploymentId} not found`);
    }

    console.log(`[pollProjectStatus] Deployment status: ${deployment.Status}`);

    // Check if deployment is still processing
    if (deployment.Status !== 'Process') {
      isProcessing = false;
    } else {
      // Wait before next poll
      await sleep(5000);
    }
  }

  return deployment as DeploymentResult;
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
 * Get project console URL based on the current API endpoint
 */
const getProjectConsoleUrl = (projectId: string): string => {
  const url1 = `https://console.cloud.tencent.com/edgeone/pages/project/${projectId}/index`;
  const url2 = `https://console.tencentcloud.com/edgeone/pages/project/${projectId}/index`;

  if (BASE_API_URL === BASE_API_URL1) {
    return url1;
  } else if (BASE_API_URL === BASE_API_URL2) {
    return url2;
  } else {
    return url1;
  }
};

/**
 * Get structured deployment result
 * @param deploymentResult The result from polling deployment status
 * @param projectId The project ID
 * @param env Environment to deploy to, either 'Production' or 'Preview'
 * @returns Structured deployment result with type, url, projectId, and consoleUrl
 */
const getDeploymentStructuredResult = async (
  deploymentResult: DeploymentResult,
  projectId: string,
  env: 'Production' | 'Preview' = 'Production'
): Promise<{
  type: 'custom' | 'temporary';
  url: string;
  projectId: string;
  consoleUrl: string;
  projectName: string;
}> => {
  // Get project details to get domain information
  const projectStatusResult = await describePagesProjects({
    projectId: projectId,
  });

  if (!projectStatusResult?.Data?.Response?.Projects?.[0]) {
    throw new Error('Failed to retrieve project status information.');
  }

  const project = projectStatusResult.Data.Response.Projects[0];

  // Check deployment status
  if (deploymentResult.Status === 'Success') {
    // For Production environment, check for custom domains
    if (
      env === 'Production' &&
      project.CustomDomains &&
      project.CustomDomains.length > 0
    ) {
      const customDomain = project.CustomDomains[0];
      if (customDomain.Status === 'Pass') {
        return {
          type: 'custom',
          url: `https://${customDomain.Domain}`,
          projectId,
          projectName: project.Name,
          consoleUrl: getProjectConsoleUrl(projectId),
        };
      }
    }

    // Process domain information
    const domain = deploymentResult.PreviewUrl
      ? deploymentResult.PreviewUrl.replace('https://', '')
      : project.PresetDomain;

    const encipherTokenResult = await describePagesEncipherToken(domain);

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
    const url = `https://${domain}?eo_token=${Token}&eo_time=${Timestamp}`;
    return {
      type: 'temporary',
      url: url,
      projectId,
      projectName: project.Name,
      consoleUrl: getProjectConsoleUrl(projectId),
    };
  } else {
    console.log(
      `[getDeploymentStructuredResult] Deployment failed with status: ${deploymentResult.Status}`
    );
    throw new Error(
      `Deployment failed with status: ${deploymentResult.Status}`
    );
  }
};

/**
 * Deploy a local folder or zip file to EdgeOne Pages
 * @param localPath Path to the local folder or zip file to deploy
 * @param env Environment to deploy to, either 'Production' or 'Preview'
 * @returns URL to the deployed site
 */
export const deployFolderOrZipToEdgeOne = async (
  localPath: string,
  env: 'Production' | 'Preview' = 'Production'
): Promise<string> => {
  // Reset logs and override console at the start
  resetLogs();
  overrideConsole();

  try {
    // Reset token cache at the start of deployment
    resetTokenCache();
    resetTempProjectName();

    // Validate folder or zip file
    const isZip = await validateFolder(localPath);

    await checkAndSetBaseUrl();

    // 1. Upload folder to COS
    const uploadResult = await uploadToEdgeOneCOS(localPath);
    if (!uploadResult.targetPath) {
      throw new Error('COS upload succeeded but targetPath is missing.');
    }
    const targetPath = uploadResult.targetPath;

    // 2. Get or create project
    console.log(`[getOrCreateProject] Getting or creating project...`);
    const projectResult = await getOrCreateProject();
    if (!projectResult?.Data?.Response?.Projects?.[0]?.ProjectId) {
      console.error('Invalid project data received: ' + projectResult);
      throw new Error('Failed to retrieve Project ID after get/create.');
    }
    const projectId = projectResult.Data.Response.Projects[0].ProjectId;
    console.log(`[getOrCreateProject] Using Project ID: ${projectId}`);

    // 3. Create deployment
    console.log(
      `[createPagesDeployment] Creating deployment in ${env} environment...`
    );
    const res = await createPagesDeployment({
      projectId,
      targetPath: targetPath,
      isZip,
      env,
    });
    const deploymentId = res.Data.Response.DeploymentId;

    // 4. Wait for deployment to complete
    console.log(
      `[pollProjectStatus] Waiting for deployment to complete (polling status)...`
    );
    await sleep(5000);
    const deploymentResult = await pollProjectStatus(projectId, deploymentId);

    // 5. Get structured deployment result and format message
    const structuredResult = await getDeploymentStructuredResult(
      deploymentResult,
      projectId,
      env
    );

    /**
     * Format deployment result into user-friendly message
     * @param deploymentResult The structured deployment result
     * @returns Text message describing the deployment status
     */

    // Append deployment logs to the result
    const logs = formatLogs();
    const finalText = `${logs}

results:
${JSON.stringify(structuredResult, null, 2)}`;

    return finalText;
  } catch (error) {
    // Ensure logs are captured even on error
    const logs = formatLogs();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const finalText = `${logs}Deployment failed: ${errorMessage}`;
    throw new Error(finalText);
  } finally {
    // Always restore console
    restoreConsole();
  }
};
