import React, { useEffect, useState } from 'react';
import api from './api';
import { useNavigate } from 'react-router-dom';

interface Directory {
    id: number;
    path: string;
    created_at: string;
}

interface FileRecord {
    id: number;
    filename: string;
    full_path: string;
    size_bytes: number;
    extension: string;
    modified_at: string;
}

const Dashboard: React.FC = () => {
    const [directories, setDirectories] = useState<Directory[]>([]);
    const [files, setFiles] = useState<FileRecord[]>([]);
    const [newDirPath, setNewDirPath] = useState('');
    const [search, setSearch] = useState('');
    const [extensionFilter, setExtensionFilter] = useState('');
    const [showDirModal, setShowDirModal] = useState(false);
    const [sortBy, setSortBy] = useState<string>('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());

    // Pagination
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 150;

    const navigate = useNavigate();

    useEffect(() => {
        fetchDirectories();
        fetchFiles();
    }, []);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            setPage(1); // Reset to page 1 on filter change
            fetchFiles(1); // Explicitly fetch page 1
            setSelectedFiles(new Set()); // Reset selection on filter change
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [search, extensionFilter, sortBy, sortOrder]);

    useEffect(() => {
        fetchFiles(page);
        setSelectedFiles(new Set()); // Reset selection on page change
    }, [page]);

    const fetchDirectories = async () => {
        try {
            const res = await api.get('/directories/');
            setDirectories(res.data);
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) navigate('/');
        }
    };

    const fetchFiles = async (currentPage = page) => {
        try {
            const skip = (currentPage - 1) * limit;
            const res = await api.get('/files/', {
                params: {
                    search,
                    extension: extensionFilter || undefined,
                    sort_by: sortBy || undefined,
                    order: sortOrder,
                    skip,
                    limit
                }
            });
            // Handle new response format { items: [], total: int }
            if (res.data.items) {
                setFiles(res.data.items);
                setTotal(res.data.total);
            } else {
                // Fallback for old API if something goes wrong (shouldn't happen)
                setFiles(res.data);
                setTotal(res.data.length);
            }
        } catch (err: any) {
            console.error(err);
        }
    };

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const getSortIcon = (column: string) => {
        if (sortBy !== column) return '↕';
        return sortOrder === 'asc' ? '↑' : '↓';
    };

    const totalPages = Math.ceil(total / limit);

    const handleAddDirectory = async () => {
        try {
            await api.post('/directories/', { path: newDirPath });
            setNewDirPath('');
            setShowDirModal(false);
            fetchDirectories();
        } catch (err: any) {
            alert('Failed to add directory: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleDeleteDirectory = async (id: number) => {
        if (!confirm('Are you sure? This will remove all indexed files from this directory.')) return;
        try {
            await api.delete(`/directories/${id}`);
            fetchDirectories();
            fetchFiles();
        } catch (err: any) {
            alert('Error deleting directory');
        }
    };

    const handleScanDirectory = async (id: number) => {
        try {
            await api.post(`/scan/${id}`);
            alert('Scan started in background');
        } catch (err: any) {
            alert('Error starting scan');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = new Set(files.map(f => f.id));
            setSelectedFiles(allIds);
        } else {
            setSelectedFiles(new Set());
        }
    };

    const handleSelectFile = (id: number) => {
        const newSelection = new Set(selectedFiles);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        setSelectedFiles(newSelection);
    };

    const handleBulkDelete = async () => {
        if (selectedFiles.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedFiles.size} files?`)) return;

        try {
            await api.post('/files/delete', { file_ids: Array.from(selectedFiles) });
            fetchFiles(page);
            setSelectedFiles(new Set());
        } catch (err: any) {
            alert('Error deleting files');
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/');
    };

    return (
        <div className="dashboard-container">
            <div className="header">
                <h2>Dashboard</h2>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button className="btn-primary" style={{ marginRight: '1rem' }} onClick={() => setShowDirModal(true)}>Manage Directories</button>
                    <button className="btn-danger" onClick={handleLogout}>Logout</button>
                </div>
            </div>

            <div className="card">
                <h3>File Manager (Total: {total})</h3>
                <div className="filters">
                    <input
                        type="text"
                        placeholder="Search filename..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', flex: 1 }}
                    />
                    <input
                        type="text"
                        placeholder="Extension (e.g. .txt)"
                        value={extensionFilter}
                        onChange={(e) => setExtensionFilter(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '150px' }}
                    />
                </div>

                {/* Pagination Controls Top */}
                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span>Page {page} of {totalPages || 1}</span>
                        {selectedFiles.size > 0 && (
                            <button className="btn-danger" onClick={handleBulkDelete}>Delete Selected ({selectedFiles.size})</button>
                        )}
                    </div>
                    <div>
                        <button
                            className="btn-secondary"
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            style={{ marginRight: '0.5rem', opacity: page <= 1 ? 0.5 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                        >
                            Previous
                        </button>
                        <button
                            className="btn-secondary"
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            style={{ opacity: page >= totalPages ? 0.5 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                        >
                            Next
                        </button>
                    </div>
                </div>

                <table>
                    <colgroup>
                        <col style={{ width: '40px' }} />
                        <col style={{ width: '60px' }} />
                        <col style={{ width: '250px' }} />
                        <col style={{ width: 'auto' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '100px' }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th>
                                <input
                                    type="checkbox"
                                    onChange={handleSelectAll}
                                    checked={files.length > 0 && selectedFiles.size === files.length}
                                />
                            </th>
                            <th>#</th>
                            <th onClick={() => handleSort('filename')} style={{ cursor: 'pointer' }}>Filename {getSortIcon('filename')}</th>
                            <th>Path</th>
                            <th onClick={() => handleSort('size_bytes')} style={{ cursor: 'pointer' }}>Size {getSortIcon('size_bytes')}</th>
                            <th>Extension</th>
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((file, index) => (
                            <tr key={file.id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={selectedFiles.has(file.id)}
                                        onChange={() => handleSelectFile(file.id)}
                                    />
                                </td>
                                <td>{(page - 1) * limit + index + 1}</td>
                                <td title={file.filename}>{file.filename}</td>
                                <td title={file.full_path}>{file.full_path}</td>
                                <td>{formatFileSize(file.size_bytes)}</td>
                                <td>{file.extension}</td>
                            </tr>
                        ))}
                        {files.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center' }}>No files found</td></tr>}
                    </tbody>
                </table>

                {/* Pagination Controls Bottom */}
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                    <button
                        className="btn-secondary"
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        style={{ marginRight: '0.5rem', opacity: page <= 1 ? 0.5 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                    >
                        Previous
                    </button>
                    <button
                        className="btn-secondary"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        style={{ opacity: page >= totalPages ? 0.5 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                    >
                        Next
                    </button>
                </div>
            </div>

            {showDirModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>Manage Directories</h3>
                        <div className="form-group">
                            <input
                                type="text"
                                placeholder="/path/to/scan"
                                value={newDirPath}
                                onChange={(e) => setNewDirPath(e.target.value)}
                            />
                        </div>
                        <button className="btn-primary" onClick={handleAddDirectory} style={{ marginBottom: '1rem' }}>Add Directory</button>

                        <h4>Configured Directories</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>Path</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {directories.map(d => (
                                    <tr key={d.id}>
                                        <td style={{ wordBreak: 'break-all' }}>{d.path}</td>
                                        <td>
                                            <button className="btn-primary" style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleScanDirectory(d.id)}>Rescan</button>
                                            <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleDeleteDirectory(d.id)}>Remove</button>
                                        </td>
                                    </tr>
                                ))}
                                {directories.length === 0 && <tr><td colSpan={2}>No directories configured</td></tr>}
                            </tbody>
                        </table>

                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={() => setShowDirModal(false)} style={{ background: '#9ca3af', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
