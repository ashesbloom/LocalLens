# Contributing to Local Lens

Thank you for your interest in contributing to Local Lens! We're excited to have you join our community of developers working to make photo organization more intelligent, private, and accessible.

## 🌟 Project Vision

Local Lens is committed to providing a **privacy-first**, **AI-powered** photo organization solution that works entirely offline. Every contribution should align with our core principles:

- **Privacy First**: All processing happens locally - no data leaves the user's device
- **Cross-Platform**: Support for Windows, macOS, and Linux
- **User-Friendly**: Intuitive interface accessible to non-technical users
- **Performance**: Efficient handling of large photo collections
- **Open Source**: Transparent, community-driven development

## 📋 Getting Started

### Prerequisites

Before contributing, ensure you have the development environment set up:

1. **Clone the repository**:
```bash
git clone https://github.com/ashesbloom/LocalLens.git
cd LocalLens
```

2. **Install development dependencies** (see [README.md](README.md#for-development) for detailed setup instructions):
   - Node.js (v18+)
   - Rust (latest stable)
   - Python (3.11+)
   - Platform-specific build tools (CMake, Visual Studio Build Tools, etc.)

3. **Set up the development environment**:

**Windows:**
```bash
# Backend setup
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install
```

**macOS (Intel & Apple Silicon):**
```bash
# Install required system dependencies first
brew install cmake dlib imagemagick

# Backend setup
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install
```

**Linux:**
```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt install build-essential cmake libopenblas-dev liblapack-dev imagemagick

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install
```

4. **Run the application in development mode**:
```bash
# Terminal 1: Start backend
cd backend
python main.py

# Terminal 2: Start frontend
cd frontend
npm run tauri dev
```

## 🤝 How to Contribute

### 1. Types of Contributions

We welcome various types of contributions:

- **🐛 Bug Fixes**: Help us identify and resolve issues
- **✨ New Features**: Implement new functionality
- **📚 Documentation**: Improve guides, README, or code comments
- **🎨 UI/UX Improvements**: Enhance the user interface and experience
- **⚡ Performance Optimizations**: Improve speed and efficiency
- **🧪 Testing**: Add or improve test coverage
- **🌍 Localization**: Add support for new languages
- **🔧 Tooling**: Improve build processes or development workflows

### 2. Before You Start

1. **Check existing issues**: Browse [GitHub Issues](https://github.com/ashesbloom/LocalLens/issues) to see if your idea is already being discussed
2. **Create an issue**: For new features or significant changes, create an issue first to discuss the approach
3. **Join the discussion**: Comment on existing issues if you'd like to work on them

### 3. Development Workflow

#### Step 1: Fork and Branch
```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/LocalLens.git
cd LocalLens
git remote add upstream https://github.com/ashesbloom/LocalLens.git

# Create a feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

#### Step 2: Make Your Changes
- Follow our [coding standards](#coding-standards)
- Write clear, descriptive commit messages
- Test your changes thoroughly
- Update documentation if needed

#### Step 3: Test Your Changes
```bash
# Run backend tests
cd backend
python -m pytest tests/

# Run frontend tests
cd frontend
npm test

# Test the full application
npm run tauri dev
```

#### Step 4: Commit and Push
```bash
git add .
git commit -m "feat: add new sorting algorithm for date-based organization"
git push origin feature/your-feature-name
```

#### Step 5: Create a Pull Request
1. Go to the [LocalLens repository](https://github.com/ashesbloom/LocalLens)
2. Click "New Pull Request"
3. Select your branch and provide a clear description
4. Link any related issues

## 📝 Coding Standards

### Python (Backend)

#### Code Style
- Follow [PEP 8](https://www.python.org/dev/peps/pep-0008/)
- Use [Black](https://black.readthedocs.io/) for code formatting
- Use [flake8](https://flake8.pycqa.org/) for linting
- Maximum line length: 88 characters

#### Example:
```python
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

class PhotoOrganizer:
    """Handles intelligent photo organization with AI-powered categorization."""
    
    def __init__(self, config: dict) -> None:
        self.config = config
        self._initialize_models()
    
    def organize_photos(self, photo_paths: List[str]) -> Optional[dict]:
        """
        Organize photos using configured sorting criteria.
        
        Args:
            photo_paths: List of absolute paths to photo files
            
        Returns:
            Dictionary containing organization results or None if failed
        """
        try:
            # Implementation here
            pass
        except Exception as e:
            logger.error(f"Failed to organize photos: {e}")
            return None
```

#### Dependencies
- Add new dependencies to `requirements.txt`
- Pin versions for stability
- Use virtual environments for testing

### JavaScript/React (Frontend)

#### Code Style
- Use [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/)
- Follow [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- Use functional components with hooks
- Use descriptive variable and function names

#### Example:
```jsx
import React, { useState, useEffect } from 'react';
import './PhotoGrid.css';

const PhotoGrid = ({ photos, onPhotoSelect }) => {
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Load photos when component mounts
    loadPhotos();
  }, []);

  const handlePhotoClick = (photo) => {
    setSelectedPhotos(prev => [...prev, photo]);
    onPhotoSelect?.(photo);
  };

  return (
    <div className="photo-grid">
      {photos.map(photo => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          onClick={() => handlePhotoClick(photo)}
          isSelected={selectedPhotos.includes(photo)}
        />
      ))}
    </div>
  );
};

export default PhotoGrid;
```

### Rust (Tauri Integration)

#### Code Style
- Follow [Rust Style Guide](https://doc.rust-lang.org/style-guide/)
- Use `cargo fmt` for formatting
- Use `cargo clippy` for linting
- Write comprehensive documentation

#### Example:
```rust
use tauri::command;
use std::path::PathBuf;

#[derive(Debug)]
pub struct AppError {
    message: String,
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

/// Validates that the selected path exists and is accessible
#[command]
pub async fn validate_photo_path(path: String) -> Result<bool, AppError> {
    let photo_path = PathBuf::from(&path);
    
    if !photo_path.exists() {
        return Err(AppError {
            message: format!("Path does not exist: {}", path),
        });
    }
    
    Ok(photo_path.is_dir() || is_supported_image_format(&photo_path))
}
```

## 🧪 Testing Guidelines

### Backend Testing
- Write unit tests for all new functions
- Use `pytest` for testing framework
- Mock external dependencies
- Test error handling and edge cases

```python
import pytest
from unittest.mock import Mock, patch
from backend.organizer_logic import PhotoOrganizer

def test_photo_organizer_initialization():
    """Test that PhotoOrganizer initializes correctly."""
    config = {"sorting_mode": "date", "face_recognition": True}
    organizer = PhotoOrganizer(config)
    assert organizer.config == config

@patch('backend.organizer_logic.face_recognition')
def test_face_detection_error_handling(mock_face_recognition):
    """Test that face detection errors are handled gracefully."""
    mock_face_recognition.side_effect = Exception("Model failed to load")
    organizer = PhotoOrganizer({"face_recognition": True})
    
    result = organizer.detect_faces("test_image.jpg")
    assert result is None  # Should return None on error
```

### Frontend Testing
- Write unit tests for components
- Use React Testing Library
- Test user interactions
- Mock API calls

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import PhotoGrid from '../components/PhotoGrid';

test('renders photo grid with photos', () => {
  const mockPhotos = [
    { id: 1, path: '/path/to/photo1.jpg', name: 'photo1.jpg' },
    { id: 2, path: '/path/to/photo2.jpg', name: 'photo2.jpg' }
  ];

  render(<PhotoGrid photos={mockPhotos} />);
  
  expect(screen.getByText('photo1.jpg')).toBeInTheDocument();
  expect(screen.getByText('photo2.jpg')).toBeInTheDocument();
});

test('calls onPhotoSelect when photo is clicked', () => {
  const mockOnPhotoSelect = jest.fn();
  const mockPhotos = [{ id: 1, path: '/path/to/photo1.jpg', name: 'photo1.jpg' }];

  render(<PhotoGrid photos={mockPhotos} onPhotoSelect={mockOnPhotoSelect} />);
  
  fireEvent.click(screen.getByText('photo1.jpg'));
  expect(mockOnPhotoSelect).toHaveBeenCalledWith(mockPhotos[0]);
});
```

## 📚 Documentation Standards

### Code Documentation
- Write clear docstrings for all functions and classes
- Include parameter types and return values
- Provide usage examples for complex functions
- Document any side effects or assumptions

### Commit Messages
Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

feat(backend): add support for HEIC image format
fix(ui): resolve photo grid layout issues on mobile
docs(readme): update installation instructions
test(organizer): add unit tests for face recognition
refactor(api): improve error handling in photo endpoints
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## 🚀 Performance Guidelines

### Backend Performance
- Profile code with large photo collections (10,000+ images)
- Use async/await for I/O operations
- Implement progress tracking for long operations
- Consider memory usage when processing multiple images
- Use appropriate data structures (sets for deduplication, etc.)

### Frontend Performance
- Lazy load images in photo grids
- Implement virtual scrolling for large lists
- Debounce search inputs
- Use React.memo for expensive components
- Optimize re-renders with useCallback and useMemo

### Build Performance
- Keep bundle sizes reasonable
- Use code splitting where appropriate
- Optimize images and assets
- Monitor build times and dependencies

## 🌍 Cross-Platform Considerations

### File Path Handling
```python
# ✅ Good - Cross-platform path handling
import os
from pathlib import Path

photo_dir = Path(user_input) / "photos"
config_file = Path.home() / ".locallens" / "config.json"

# ❌ Bad - Platform-specific paths
photo_dir = "C:\\Users\\Photos"  # Windows only
config_file = "/home/user/.locallens/config.json"  # Unix only
```

### Process Management
- Test process spawning on all platforms
- Handle platform-specific executable extensions
- Consider different shell environments

### UI Considerations
- Test keyboard shortcuts on all platforms
- Consider platform-specific UI conventions
- Handle different screen densities and sizes

## 🔍 Security Guidelines

### Data Privacy
- Never log sensitive user data (file paths, personal info)
- Ensure all processing happens locally
- Don't send telemetry or analytics data
- Be transparent about any network requests

### Input Validation
```python
# ✅ Good - Validate and sanitize inputs
def process_photo_path(user_path: str) -> Optional[Path]:
    try:
        path = Path(user_path).resolve()
        if not path.exists() or not path.is_file():
            return None
        if path.suffix.lower() not in SUPPORTED_FORMATS:
            return None
        return path
    except (OSError, ValueError):
        return None

# ❌ Bad - Direct usage without validation
def process_photo_path(user_path: str) -> Path:
    return Path(user_path)  # Could be exploited
```

## 📋 Pull Request Guidelines

### Before Submitting
- [ ] Code follows our style guidelines
- [ ] All tests pass locally
- [ ] New features have appropriate tests
- [ ] Documentation is updated
- [ ] Commit messages follow conventional format
- [ ] Changes are backwards compatible (or breaking changes are documented)

### PR Description Template
```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed on [Windows/macOS/Linux]

## Screenshots (if applicable)
Add screenshots to show UI changes.

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged and published
```

## 🎉 Recognition

We appreciate all contributions! Contributors will be:
- Listed in our README acknowledgments
- Mentioned in release notes for significant contributions
- Invited to join our contributors' Discord channel (coming soon)

## 📞 Getting Help

- **Discussion**: Start a [GitHub Discussion](https://github.com/ashesbloom/LocalLens/discussions)
- **Issues**: Report bugs via [GitHub Issues](https://github.com/ashesbloom/LocalLens/issues)
- **Email**: Contact maintainers at [mayankpandeydk123@gmail.com](mailto:mayankpandeydk123@gmail.com)

## 📄 License

By contributing to Local Lens, you agree that your contributions will be licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

---

**Thank you for helping make Local Lens better! 🚀**

*Together, we're building the future of privacy-first photo organization.*
