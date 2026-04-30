'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    ReactFlow,
    Background,
    useReactFlow,
    Connection,
    BackgroundVariant,
    NodeTypes,
    EdgeTypes,
    ReactFlowProvider,
    ConnectionLineType,
    Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { PageNode } from './nodes/page-node'
import { ProjectNode } from './nodes/project-node'
import { SitemapEdge as SitemapEdgeComponent } from './edges/sitemap-edge'
import { useSitemapStore, SitemapEdge } from '@/store/sitemap-store'

// Custom node types
const nodeTypes: NodeTypes = {
    page: PageNode,
    project: ProjectNode,
}

// Custom edge types
const edgeTypes: EdgeTypes = {
    sitemap: SitemapEdgeComponent,
}

interface SitemapViewProps {
    projectName?: string
}

function SitemapCanvas({ projectName }: SitemapViewProps) {
    const reactFlowInstance = useReactFlow()
    const containerRef = useRef<HTMLDivElement>(null)

    const {
        nodes,
        edges,
        activeTool,
        isPanning,
        onNodesChange,
        onEdgesChange,
        setEdges,
        setZoomLevel,
        setIsPanning,
        setSelectedNodeId,
        setActiveTool,
        setReactFlowFunctions,
        addNode,
        closeSectionPicker,
        handleNodeDragStart,
        handleNodeDrag,
        handleNodeDragStop,
    } = useSitemapStore()

    const [hasInitialFit, setHasInitialFit] = useState(false)

    // Register ReactFlow zoom functions for toolbar controls
    useEffect(() => {
        const zoomTo = (zoom: number) => {
            reactFlowInstance.zoomTo(zoom, { duration: 200 })
        }
        const fitView = () => {
            reactFlowInstance.fitView({ padding: 0.3, duration: 300 })
        }
        setReactFlowFunctions(zoomTo, fitView)
    }, [reactFlowInstance, setReactFlowFunctions])

    // Auto-fit on first project open — waits until nodes are loaded, fires once
    useEffect(() => {
        if (hasInitialFit || nodes.length === 0) return

        // Small delay so ReactFlow has rendered the nodes and can calculate bounds
        const timer = setTimeout(() => {
            reactFlowInstance.fitView({ padding: 0.2, duration: 400 })
            setHasInitialFit(true)
        }, 150)

        return () => clearTimeout(timer)
    }, [hasInitialFit, nodes.length, reactFlowInstance])

    // Update project name in nodes
    useEffect(() => {
        if (projectName) {
            const projectNode = nodes.find(n => n.id === 'project')
            if (projectNode && projectNode.data.label !== projectName) {
                useSitemapStore.getState().updateNode('project', { label: projectName })
            }
        }
    }, [projectName, nodes])

    // Handle space key for panning (Figma-style) - only when not in an input field
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't intercept space key when typing in inputs
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return
            }

            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault()
                setIsPanning(true)
            }
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                setIsPanning(false)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [setIsPanning])

    // Handle zoom changes - update on every move for real-time feedback
    const onMove = useCallback(() => {
        const zoom = reactFlowInstance.getZoom()
        setZoomLevel(Math.round(zoom * 100))
    }, [reactFlowInstance, setZoomLevel])

    // Custom exponential zoom handler — matches wireframe's smooth feel.
    // Attached in capture phase so it fires before ReactFlow's internal handlers.
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return // plain scroll → let ReactFlow pan

            e.preventDefault()
            e.stopPropagation()

            const currentZoom = reactFlowInstance.getZoom()
            const delta = -e.deltaY
            const factor = Math.pow(2, delta * 0.008)
            const newZoom = Math.min(3, Math.max(0.05, currentZoom * factor))

            // Zoom toward cursor
            const rect = container.getBoundingClientRect()
            const cursorX = e.clientX - rect.left
            const cursorY = e.clientY - rect.top

            // screenToFlowPosition expects screen/client coords, not container-relative
            const pointBefore = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })

            // viewport.x/y are container-relative, so use cursorX/cursorY
            const newX = cursorX - pointBefore.x * newZoom
            const newY = cursorY - pointBefore.y * newZoom
            reactFlowInstance.setViewport({ x: newX, y: newY, zoom: newZoom }, { duration: 0 })
        }

        // capture: true → fires before ReactFlow's bubble-phase handlers
        container.addEventListener('wheel', handleWheel, { passive: false, capture: true })
        return () => container.removeEventListener('wheel', handleWheel, { capture: true })
    }, [reactFlowInstance])

    // Handle new connections
    const onConnect = useCallback(
        (params: Connection) => {
            const newEdge: SitemapEdge = {
                ...params,
                type: 'smoothstep',
                id: `e-${params.source}-${params.target}`,
                source: params.source || '',
                target: params.target || '',
                sourceHandle: params.sourceHandle ?? null,
                targetHandle: params.targetHandle ?? null,
            }
            setEdges([...edges, newEdge])
        },
        [edges, setEdges]
    )

    // Handle node selection
    const onNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
        setSelectedNodeId(node.id)
    }, [setSelectedNodeId])

    // Handle pane click - deselect or add new node in add mode
    const onPaneClick = useCallback((event: React.MouseEvent) => {
        // Always close section picker when clicking on canvas
        closeSectionPicker()

        if (activeTool === 'add') {
            // Get click position in flow coordinates
            const reactFlowBounds = containerRef.current?.getBoundingClientRect()
            if (!reactFlowBounds) return

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
            })

            // Create a new page node
            const newNodeId = `page-${Date.now()}`
            const newNode = {
                id: newNodeId,
                type: 'page',
                position,
                data: {
                    label: 'New Page',
                    slug: '/new-page',
                    sections: [],
                    isNew: true,
                },
            }

            addNode(newNode)
            setSelectedNodeId(newNodeId)
            setActiveTool('select') // Switch back to select after adding
        } else {
            setSelectedNodeId(null)
        }
    }, [activeTool, reactFlowInstance, addNode, setSelectedNodeId, setActiveTool, closeSectionPicker])

    // Handle node drag lifecycle - Relume-style: live shuffle preview + snap to tree layout
    const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
        handleNodeDragStart(node.id)
    }, [handleNodeDragStart])

    const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => {
        handleNodeDrag(node.id)
    }, [handleNodeDrag])

    const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
        handleNodeDragStop(node.id)
    }, [handleNodeDragStop])

    // Determine cursor and pan mode
    const shouldPan = isPanning || activeTool === 'hand'
    const cursorClass = shouldPan
        ? 'cursor-grab active:cursor-grabbing'
        : activeTool === 'add'
            ? 'cursor-crosshair'
            : ''  // Use ReactFlow's default cursor (pointer for nodes, default for canvas)

    return (
        <div ref={containerRef} className={`w-full h-full ${cursorClass}`}>
            <style jsx global>{`
                .react-flow__pane {
                    cursor: default !important;
                }
                .react-flow__node {
                    cursor: ${activeTool === 'select' ? 'grab' : 'pointer'} !important;
                    transition: transform 0.25s ease;
                }
                .react-flow__node.dragging {
                    cursor: grabbing !important;
                    transition: none;
                    opacity: 0.7;
                    z-index: 1000 !important;
                }
                .react-flow__edge-path {
                    cursor: pointer;
                }
            `}</style>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onMove={onMove}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={activeTool === 'select'}
                panOnDrag={shouldPan}
                selectionOnDrag={false}
                // Two-finger scroll = pan; zoom handled by custom exponential handler
                panOnScroll={true}
                panOnScrollSpeed={0.8}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                preventScrolling={true}
                minZoom={0.05}
                maxZoom={3}
                defaultEdgeOptions={{
                    type: 'sitemap',
                    animated: false,
                }}
                connectionLineType={ConnectionLineType.SmoothStep}
                proOptions={{ hideAttribution: true }}
                className="bg-muted/20"
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={24}
                    size={1}
                    color="#d1d5db"
                />
            </ReactFlow>
        </div>
    )
}

// SitemapCanvas is exported separately so ReactFlowProvider can be hoisted
// to preserve viewport state across tab switches
export { SitemapCanvas }

export function SitemapView({ projectName = 'My Project' }: SitemapViewProps) {
    return (
        <ReactFlowProvider>
            <SitemapCanvas projectName={projectName} />
        </ReactFlowProvider>
    )
}