import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types'
import { createJWT } from '@/lib/appwrite'

interface ProjectState {
    // State
    projects: Project[]
    currentProject: Project | null
    isLoading: boolean
    error: string | null

    // Actions
    fetchProjects: () => Promise<void>
    fetchProject: (id: string) => Promise<Project | null>
    createProject: (data: CreateProjectInput) => Promise<Project | null>
    updateProject: (id: string, data: UpdateProjectInput) => Promise<boolean>
    deleteProject: (id: string) => Promise<boolean>
    setCurrentProject: (project: Project | null) => void
    clearError: () => void
}

/**
 * Helper to make authenticated API calls
 */
async function authFetch(url: string, options: RequestInit = {}) {
    const jwt = await createJWT()
    if (!jwt) {
        throw new Error('Not authenticated')
    }

    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${jwt.jwt}`,
            'Content-Type': 'application/json',
        },
    })
}

export const useProjectStore = create<ProjectState>()(
    immer((set, get) => ({
        // Initial state
        projects: [],
        currentProject: null,
        isLoading: false,
        error: null,

        // Fetch all projects
        fetchProjects: async () => {
            set(state => {
                state.isLoading = true
                state.error = null
            })

            try {
                const response = await authFetch('/api/projects')

                if (!response.ok) {
                    throw new Error('Failed to fetch projects')
                }

                const data = await response.json()

                set(state => {
                    state.projects = data.projects
                    state.isLoading = false
                })
            } catch (error) {
                set(state => {
                    state.error = error instanceof Error ? error.message : 'Failed to fetch projects'
                    state.isLoading = false
                })
            }
        },

        // Fetch single project
        fetchProject: async (id: string) => {
            set(state => {
                state.isLoading = true
                state.error = null
            })

            try {
                const response = await authFetch(`/api/projects/${id}`)

                if (!response.ok) {
                    throw new Error('Failed to fetch project')
                }

                const data = await response.json()

                set(state => {
                    state.currentProject = data.project
                    state.isLoading = false
                })

                return data.project as Project
            } catch (error) {
                set(state => {
                    state.error = error instanceof Error ? error.message : 'Failed to fetch project'
                    state.isLoading = false
                })
                return null
            }
        },

        // Create new project
        createProject: async (data: CreateProjectInput) => {
            set(state => {
                state.isLoading = true
                state.error = null
            })

            try {
                const response = await authFetch('/api/projects', {
                    method: 'POST',
                    body: JSON.stringify(data),
                })

                if (!response.ok) {
                    let backendError = 'Failed to create project'
                    try {
                        const payload = await response.json()
                        if (payload?.error) {
                            backendError = payload.details
                                ? `${payload.error}: ${payload.details}`
                                : payload.error
                        }
                    } catch {
                        // Ignore non-JSON error payloads
                    }

                    throw new Error(backendError)
                }

                const result = await response.json()
                const newProject = result.project

                set(state => {
                    state.projects.unshift(newProject)
                    state.currentProject = newProject
                    state.isLoading = false
                })

                return newProject
            } catch (error) {
                set(state => {
                    state.error = error instanceof Error ? error.message : 'Failed to create project'
                    state.isLoading = false
                })
                return null
            }
        },

        // Update project
        updateProject: async (id: string, data: UpdateProjectInput) => {
            set(state => {
                state.isLoading = true
                state.error = null
            })

            try {
                const response = await authFetch(`/api/projects/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(data),
                })

                if (!response.ok) {
                    throw new Error('Failed to update project')
                }

                const result = await response.json()
                const updatedProject = result.project

                set(state => {
                    // Update in projects list
                    const index = state.projects.findIndex(p => p.projectId === id)
                    if (index !== -1) {
                        state.projects[index] = updatedProject
                    }

                    // Update current project if it's the one being updated
                    if (state.currentProject?.projectId === id) {
                        state.currentProject = updatedProject
                    }

                    state.isLoading = false
                })

                return true
            } catch (error) {
                set(state => {
                    state.error = error instanceof Error ? error.message : 'Failed to update project'
                    state.isLoading = false
                })
                return false
            }
        },

        // Delete project
        deleteProject: async (id: string) => {
            set(state => {
                state.isLoading = true
                state.error = null
            })

            try {
                const response = await authFetch(`/api/projects/${id}`, {
                    method: 'DELETE',
                })

                if (!response.ok) {
                    throw new Error('Failed to delete project')
                }

                set(state => {
                    state.projects = state.projects.filter(p => p.projectId !== id)

                    if (state.currentProject?.projectId === id) {
                        state.currentProject = null
                    }

                    state.isLoading = false
                })

                return true
            } catch (error) {
                set(state => {
                    state.error = error instanceof Error ? error.message : 'Failed to delete project'
                    state.isLoading = false
                })
                return false
            }
        },

        // Set current project (local only)
        setCurrentProject: (project: Project | null) => {
            set(state => {
                state.currentProject = project
            })
        },

        // Clear error
        clearError: () => {
            set(state => {
                state.error = null
            })
        },
    }))
)
