import yaml from 'js-yaml';

export interface LatestYml {
  version: string;
  releaseDate: string;
  files: Array<{
    url: string;
    sha512: string;
    size: number;
  }>;
  path: string;
  sha512: string;
  signature: string;
}

export function generateLatestYml(options: {
  version: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  signature: string;
  baseUrl: string;
}): string {
  const data: LatestYml = {
    version: options.version,
    releaseDate: new Date().toISOString(),
    files: [
      {
        url: `${options.baseUrl}/releases/download/${options.fileName}`,
        sha512: options.fileHash,
        size: options.fileSize,
      },
    ],
    path: options.fileName,
    sha512: options.fileHash,
    signature: options.signature,
  };

  return yaml.dump(data, { lineWidth: 120 });
}
