# Code Snapshot

**Export your codebase instantly • 100% local • Zero uploads • Complete privacy**

## Overview

**Code Snapshot** is a privacy-first, client-side tool that lets developers export their entire codebase as either:

- 📄 **Combined TXT**: All files merged into one document with metadata headers
- 🗜️ **ZIP Archive**: Complete folder structure preserved in a compressed archive

**Everything happens in your browser** - no files are uploaded, no data is tracked, no servers involved.

## Features

### Privacy & Security

- **100% Client-Side**: All processing happens in your browser via WebAssembly & Web Workers
- **Zero Uploads**: Your code never leaves your computer
- **No Tracking**: No analytics, no cookies, no telemetry
- **Open Source**: Audit the entire codebase yourself

### Performance

- **Handles 10,000+ files** efficiently with chunked processing
- **Memory-safe**: Streams data to avoid browser memory limits (tested with 1.5GB+ projects)
- **Real-time progress**: Live progress bars with cancel capability
- **Fast compression**: Uses fflate (3-5x faster than JSZip)

### User Experience

- **VS Code-inspired UI**: Dark theme, resizable sidebar, keyboard shortcuts
- **Drag & Drop**: Import files or entire folders recursively
- **File Tree**: Collapsible explorer view with search-ready structure
- **Easy Management**: Remove individual files or clear all with one click

## Browser Limits & Best Practices

| Scenario                          | Recommendation                                       |
| --------------------------------- | ---------------------------------------------------- |
| **Total size < 200MB**            | Works perfectly for both TXT and ZIP exports         |
| **Total size 200MB–2GB**          | ZIP recommended; TXT may be slow but supported       |
| **Total size > 2GB**              | ⚠️ Use ZIP export; consider filtering large binaries |
| **10,000+ files**                 | Chunked processing handles this efficiently          |
| **Binary files (images, videos)** | ⚠️ Exclude via filters for faster TXT exports        |

### Tips for Large Projects

1. **Use ZIP for large codebases** - faster and smaller output
2. **Filter out binaries** before TXT export:
   - Images: `*.jpg, *.png, *.gif, *.svg`
   - Videos: `*.mp4, *.webm, *.mov`
   - Archives: `*.zip, *.tar, *.gz`
3. **Exclude dependencies**: `node_modules`, `vendor`, `.git` are auto-excluded
4. **Monitor browser memory**: Close other tabs when exporting >1GB projects

## Contributing

Contributions are always welcome. Feel free to suggest improvements, report issues, or submit changes to help make Code Snapshot better.

### How to Contribute

- **Found a bug?** [Open an issue](https://github.com/vinay-patel22/code-snapshot/issues)
- **Have a feature idea?** [Create an issue](https://github.com/vinay-patel22/code-snapshot/issues) or reach out
- **Want to improve code?** Fork and submit a pull request
- **Improve docs?** Documentation updates are always appreciated

### Questions?

Feel free to reach out anytime:

- Open an [issue](https://github.com/vinay-patel22/code-snapshot/issues) on GitHub
- Ask anything, no question is too small
- Open to discussing ideas and improvements

## License

MIT License - See [LICENSE](LICENSE) for details

## Support

Find this tool useful? Consider:

- Starring the repository
- Sharing with other developers
- Reporting bugs to help improve it

Thank you for using Code Snapshot.
