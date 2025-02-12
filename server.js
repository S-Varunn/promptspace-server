require('dotenv').config();
const express = require('express');
const multer = require('multer');
const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3000;


const TARGET_REPO = `https://S-Varunn:${process.env.GIT_TOKEN}@github.com/S-Varunn/promptspace.git`;
const LOCAL_REPO_PATH = path.resolve(__dirname, 'local-target-repo');

// Initialize simple-git for the main repo
const git = simpleGit();

(async () => {
  try {
    if (!fs.existsSync(LOCAL_REPO_PATH)) {
      console.log('Cloning the repository...');
      await git.clone(TARGET_REPO, LOCAL_REPO_PATH);
    } else {
      console.log('Repository already exists.');
      const repoGit = simpleGit(LOCAL_REPO_PATH);

      console.log('Force pulling the latest changes...');
      await repoGit.fetch('origin', process.env.GIT_BRANCH);
      await repoGit.reset(['--hard', `origin/${process.env.GIT_BRANCH}`]);  // Reset to match the remote branch exactly
      console.log('Successfully force pulled and reset to the latest remote version.');
    }
  } catch (error) {
    console.error('Error during Git setup:', error);
  }
})();



// Multer setup for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOCAL_REPO_PATH);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Endpoint for uploading or updating a prompt and metadata
app.post('/upload', upload.single('prompt'), async (req, res) => {
  try {
    const { name, description, author } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folderName = `${name}-${author}`.replace(/\s+/g, '_');
    const promptFolderPath = path.join(LOCAL_REPO_PATH, folderName);

    let commitMessage = '';
    if (fs.existsSync(promptFolderPath)) {
      commitMessage = `Chore: Updating prompt ${name} by ${author}`;
    } else {
      fs.ensureDirSync(promptFolderPath);
      commitMessage = `Feat: Adding new prompt ${name} by ${author}`;
    }

    const promptFilePath = path.join(promptFolderPath, req.file.originalname);
    fs.moveSync(req.file.path, promptFilePath, { overwrite: true });

    const metadata = {
      name,
      description,
      author,
      uploadedAt: new Date().toISOString(),
    };
    const metadataFilePath = path.join(promptFolderPath, 'metadata.json');
    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata, null, 2));

    const repoGit = simpleGit(LOCAL_REPO_PATH);
    await repoGit.add(promptFolderPath);
    await repoGit.commit(commitMessage);
    await repoGit.push('origin', process.env.GIT_BRANCH);

    res.status(200).json({ message: `Prompt pushed to Git successfully` });
  } catch (error) {
    console.error('Error uploading/updating prompt:', error);
    res.status(500).json({ error: 'Failed to upload or update prompt' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Prompt marketplace backend running on http://localhost:${PORT}`);
});
