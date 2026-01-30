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
    const [directoryFilter, setDirectoryFilter] = useState('');
    const [minSize, setMinSize] = useState('');
    const [maxSize, setMaxSize] = useState('');
    const [showLogModal, setShowLogModal] = useState(false);
    const [logs, setLogs] = useState('');
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<any | null>(null);
    const [historyDetails, setHistoryDetails] = useState<any[]>([]);

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
    }, [search, extensionFilter, sortBy, sortOrder, directoryFilter, minSize, maxSize]);

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
                    directory_id: directoryFilter || undefined,
                    min_size: minSize ? parseInt(minSize) * 1024 * 1024 : undefined, // Convert MB to bytes
                    max_size: maxSize ? parseInt(maxSize) * 1024 * 1024 : undefined, // Convert MB to bytes
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
            const res = await api.post('/directories/', { path: newDirPath });
            setNewDirPath('');
            // setShowDirModal(false); // Keep modal open
            await fetchDirectories(); // Refresh list to show new dir

            // Trigger scan immediately
            if (res.data && res.data.id) {
                handleScanDirectory(res.data.id);
            }
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

    const fetchLogs = async () => {
        try {
            const res = await api.get('/logs');
            setLogs(res.data.logs);
        } catch (err) {
            setLogs('Failed to fetch logs');
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await api.get('/audit/deletions');
            setHistoryLogs(res.data);
        } catch (err) {
            console.error('Failed to fetch history', err);
        }
    };

    const fetchHistoryDetails = async (logId: number) => {
        try {
            const res = await api.get(`/audit/deletions/${logId}/items`);
            setHistoryDetails(res.data);
            const log = historyLogs.find(l => l.id === logId);
            setSelectedHistoryItem(log);
        } catch (err) {
            console.error('Failed to fetch history details', err);
        }
    };

    useEffect(() => {
        if (showHistoryModal) {
            fetchHistory();
        }
    }, [showHistoryModal]);

    useEffect(() => {
        if (showLogModal) {
            fetchLogs();
            // Auto refresh every 5 seconds while open
            const interval = setInterval(fetchLogs, 5000);
            return () => clearInterval(interval);
        }
    }, [showLogModal]);

    const [scanProgress, setScanProgress] = useState<{ total: number; file: string } | null>(null);

    const handleScanDirectory = async (id: number) => {
        try {
            setScanProgress({ total: 0, file: 'Starting scan...' });

            // Use native fetch to handle streaming response
            const token = localStorage.getItem('token');
            const baseURL = (localStorage.getItem('backend_url') || 'http://127.0.0.1:8000').replace(/\/$/, '');
            const response = await fetch(`${baseURL}/scan/${id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Scan failed');
            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.type === 'progress') {
                            setScanProgress({ total: data.count, file: data.file });
                        } else if (data.type === 'complete') {
                            setScanProgress(null);
                            alert(`Scan complete! Scanned: ${data.total_scanned}, Added: ${data.added}, Deleted: ${data.deleted}`);
                            fetchFiles();
                        }
                    } catch (e) {
                        console.error('Error parsing JSON line', e);
                    }
                }
            }
        } catch (err: any) {
            console.error(err);
            alert('Error scanning directory');
            setScanProgress(null);
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
                <h2>Dashboard</h2>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button className="btn-secondary" style={{ marginRight: '1rem', background: '#e5e7eb', color: '#374151', border: '1px solid #d1d5db' }} onClick={() => setShowLogModal(true)}>System Logs</button>
                    <button className="btn-secondary" style={{ marginRight: '1rem', background: '#e5e7eb', color: '#374151', border: '1px solid #d1d5db' }} onClick={() => setShowHistoryModal(true)}>Deletion History</button>
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
                    <select
                        value={directoryFilter}
                        onChange={(e) => setDirectoryFilter(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '200px' }}
                    >
                        <option value="">All Directories</option>
                        {directories.map(d => (
                            <option key={d.id} value={d.id}>{d.path}</option>
                        ))}
                    </select>
                    <input
                        type="number"
                        placeholder="Min Size (MB)"
                        value={minSize}
                        onChange={(e) => setMinSize(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '120px' }}
                    />
                    <input
                        type="number"
                        placeholder="Max Size (MB)"
                        value={maxSize}
                        onChange={(e) => setMaxSize(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '120px' }}
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
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
                    {selectedFiles.size > 0 && (
                        <button className="btn-danger" onClick={handleBulkDelete}>Delete Selected ({selectedFiles.size})</button>
                    )}
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
                                            <button
                                                className="btn-primary"
                                                style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                                onClick={() => handleScanDirectory(d.id)}
                                                disabled={scanProgress !== null}
                                            >
                                                {scanProgress !== null ? 'Scanning...' : 'Rescan'}
                                            </button>
                                            <button className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleDeleteDirectory(d.id)}>Remove</button>
                                        </td>
                                    </tr>
                                ))}
                                {directories.length === 0 && <tr><td colSpan={2}>No directories configured</td></tr>}
                            </tbody>
                        </table>

                        {scanProgress && (
                            <div style={{ marginTop: '1rem', background: '#f3f4f6', padding: '0.5rem', borderRadius: '4px' }}>
                                <strong>Scanning...</strong>
                                <div style={{ fontSize: '0.9rem', color: '#555' }}>Parsed Files: {scanProgress.total}</div>
                                <div style={{ fontSize: '0.8rem', color: '#777', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Current: {scanProgress.file}</div>
                                <div style={{ width: '100%', height: '4px', background: '#e5e7eb', marginTop: '5px', borderRadius: '2px' }}>
                                    <div style={{ width: '100%', height: '100%', background: '#6366f1', borderRadius: '2px', animation: 'pulse 1.5s infinite' }}></div>
                                </div>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={() => setShowDirModal(false)} style={{ background: '#9ca3af', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {showLogModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '800px', width: '90%' }}>
                        <h3>System Logs</h3>
                        <div style={{
                            background: '#1f2937',
                            color: '#e5e7eb',
                            padding: '1rem',
                            borderRadius: '4px',
                            height: '400px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                            fontSize: '0.9rem',
                            marginBottom: '1rem'
                        }}>
                            {logs || 'Loading logs...'}
                        </div>
                        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                            <button className="btn-secondary" onClick={fetchLogs} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>Refresh Now</button>
                            <button className="btn-secondary" onClick={() => setShowLogModal(false)} style={{ background: '#9ca3af', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {showHistoryModal && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '900px', width: '90%', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <h3>Deletion History</h3>
                        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: '1rem' }}>
                            <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #eee', paddingRight: '1rem' }}>
                                <table className="file-table" style={{ width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>User</th>
                                            <th>Type</th>
                                            <th>Count</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyLogs.map(log => (
                                            <tr key={log.id} style={{ background: selectedHistoryItem?.id === log.id ? '#f3f4f6' : 'transparent' }}>
                                                <td>{new Date(log.timestamp).toLocaleString()}</td>
                                                <td>{log.username}</td>
                                                <td>{log.action_type}</td>
                                                <td>{log.file_count}</td>
                                                <td>
                                                    <button onClick={() => fetchHistoryDetails(log.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>View Files</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', background: '#f9fafb', padding: '1rem', borderRadius: '4px' }}>
                                <h4>Deleted Files {selectedHistoryItem ? `(Log #${selectedHistoryItem.id})` : ''}</h4>
                                {selectedHistoryItem ? (
                                    <ul style={{ listStyle: 'none', padding: 0 }}>
                                        {historyDetails.map(item => (
                                            <li key={item.id} style={{ padding: '0.25rem 0', borderBottom: '1px solid #eee', fontSize: '0.9rem' }}>
                                                <div style={{ fontWeight: 'bold' }}>{item.filename}</div>
                                                <div style={{ color: '#666', fontSize: '0.8rem' }}>{item.full_path}</div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p style={{ color: '#666' }}>Select a deletion record to view affected files.</p>
                                )}
                            </div>
                        </div>
                        <div className="modal-actions" style={{ marginTop: '1rem' }}>
                            <button className="btn-secondary" onClick={() => setShowHistoryModal(false)} style={{ background: '#9ca3af', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
