import * as unzipper from 'unzipper';
import * as fs from 'fs';
import * as path from 'path';

const zipUrl = 'https://v0chat-agent-data-prod.s3.us-east-1.amazonaws.com/vm-binary/OI6qemn7WDU/ed5bca557c610f4a9ec2bcb2943865d9895dac842bda91a41e89de1dbe38f93e.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA52KF4VHQDTZ5RDMT%2F20260323%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260323T003637Z&X-Amz-Expires=3600&X-Amz-Signature=f6f4928575e7534377a9965b1c8c04d632d891baa7bca96b4ed587d119f4e99e&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject';

async function extractAllFiles() {
  try {
    const response = await fetch(zipUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    const directory = await unzipper.Open.buffer(Buffer.from(buffer));
    
    // Get all files sorted
    const files = directory.files.filter(f => f.type !== 'Directory').sort((a, b) => a.path.localeCompare(b.path));
    
    const outputDir = '/vercel/share/v0-project/extracted';
    
    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    console.log(`Extracting ${files.length} files to ${outputDir}...`);
    
    for (const file of files) {
      try {
        const content = await file.buffer();
        const outputPath = path.join(outputDir, file.path);
        const outputDirPath = path.dirname(outputPath);
        
        // Create directory structure
        if (!fs.existsSync(outputDirPath)) {
          fs.mkdirSync(outputDirPath, { recursive: true });
        }
        
        // Write file
        fs.writeFileSync(outputPath, content);
        console.log(`Extracted: ${file.path}`);
      } catch (e) {
        console.log(`Error extracting ${file.path}: ${e.message}`);
      }
    }
    
    console.log('\n=== Extraction Complete ===');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

extractAllFiles();
