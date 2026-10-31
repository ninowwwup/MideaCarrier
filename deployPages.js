import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
const tokenMatch = remoteUrl.match(/x-access-token:([^@]+)@github\.com\/([^/]+)\/([^.]+)/);

// Copy dist/index.html to dist/404.html for SPA routing on GitHub Pages & static hosts
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  fs.copyFileSync(path.join(distDir, 'index.html'), path.join(distDir, '404.html'));
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
}

// Deploy dist folder to gh-pages branch using a temporary git init inside dist
execSync('git init', { cwd: distDir, stdio: 'inherit' });
execSync('git checkout -B gh-pages', { cwd: distDir, stdio: 'inherit' });
execSync('git add -A', { cwd: distDir, stdio: 'inherit' });
execSync('git -c user.name="MIGOU Deploy" -c user.email="deploy@migou.local" commit --allow-empty -m "deploy: production build to gh-pages"', { cwd: distDir, stdio: 'inherit' });
execSync(`git push -f "${remoteUrl}" gh-pages:gh-pages`, { cwd: distDir, stdio: 'inherit' });

// Also commit and push main branch
execSync('git add -A', { stdio: 'inherit' });
execSync('git commit --allow-empty -m "chore(deploy): universal relative paths and gh-pages live deployment"', { stdio: 'inherit' });
execSync('git push origin main', { stdio: 'inherit' });

// Enable GitHub Pages via API if not yet enabled
if (tokenMatch) {
  const [, token, owner, repo] = tokenMatch;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pages`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'MIGOU-Deploy-Agent',
  };

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: { branch: 'gh-pages', path: '/' },
      }),
    });
    const data = await res.json().catch(() => ({}));
    console.log('GitHub Pages status:', res.status, data.html_url || data.message || '');
  } catch (err) {
    console.warn('Erro ao ativar GitHub Pages via API:', err);
  }
}
