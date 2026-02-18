import {
    Play, Eye, Type, Clock, MousePointer, Info,
    MousePointerClick, Move, Scroll, RefreshCw,
    Code, GitBranch
} from 'lucide-react'
import './SnippetLibrary.css'

export default function SnippetLibrary({ onInsert }) {
    const snippets = [
        {
            group: 'Interactions',
            items: [
                { name: 'Click', code: 'vnc.click(x, y)', icon: MousePointer, desc: 'Click at coordinates' },
                { name: 'Double Click', code: 'vnc.double_click(x, y)', icon: MousePointerClick, desc: 'Double-click at coordinates' },
                { name: 'Right Click', code: 'vnc.right_click(x, y)', icon: MousePointer, desc: 'Right-click at coordinates' },
                { name: 'Type', code: 'vnc.type("text")', icon: Type, desc: 'Type string' },
                { name: 'Press Key', code: 'vnc.press("enter")', icon: Type, desc: 'Press a special key' },
                { name: 'Drag', code: 'vnc.drag(x1, y1, x2, y2)', icon: Move, desc: 'Drag from point A to B' },
                { name: 'Move Mouse', code: 'vnc.move(x, y)', icon: MousePointer, desc: 'Move mouse to coordinates' },
                { name: 'Scroll', code: 'vnc.scroll("down", clicks=5)', icon: Scroll, desc: 'Scroll mouse wheel' },
            ]
        },
        {
            group: 'Smart Waits',
            items: [
                { name: 'Wait for Image', code: 'vnc.wait_for_image("template.png", timeout=30)', icon: Eye, desc: 'Pause until image found' },
                { name: 'Wait for Text', code: 'vnc.wait_for_text("Success", timeout=30)', icon: Info, desc: 'Pause until text found' },
                { name: 'Static Wait', code: 'vnc.wait(5)', icon: Clock, desc: 'Pause for N seconds' },
            ]
        },
        {
            group: 'Logic & Control Flow',
            items: [
                {
                    name: 'If/Else',
                    code: 'if vnc.exists("template.png"):\n    vnc.click("template.png")\nelse:\n    print("Not found")',
                    icon: GitBranch,
                    desc: 'Conditional logic'
                },
                {
                    name: 'Repeat (Loop)',
                    code: 'for i in range(5):\n    vnc.click(x, y)\n    vnc.wait(1)',
                    icon: RefreshCw,
                    desc: 'Repeat actions multiple times'
                },
                {
                    name: 'Wait While',
                    code: 'while not vnc.exists("ready.png"):\n    vnc.wait(1)',
                    icon: Clock,
                    desc: 'Wait for a dynamic condition'
                },
            ]
        },
        {
            group: 'Advanced',
            items: [
                { name: 'Screenshot', code: 'vnc.save_screenshot("failure.png")', icon: Eye, desc: 'Take a screenshot' },
                { name: 'Custom Code', code: 'print("Hello from AutoVNC")', icon: Code, desc: 'Generic Python code' },
            ]
        }
    ]

    return (
        <div className="snippet-library">
            <div className="library-header">
                <h3>Snippet Library</h3>
                <p className="text-xs opacity-60">Click a snippet to insert at cursor</p>
            </div>
            <div className="library-scroll">
                {snippets.map(group => (
                    <div key={group.group} className="snippet-group">
                        <h4 className="group-title">{group.group}</h4>
                        <div className="group-items">
                            {group.items.map(item => (
                                <button
                                    key={item.name}
                                    className="snippet-item"
                                    onClick={() => onInsert(item.code)}
                                    title={item.desc}
                                >
                                    <div className="item-icon">
                                        <item.icon size={14} />
                                    </div>
                                    <div className="item-details">
                                        <div className="item-name">{item.name}</div>
                                        <code className="item-code">{item.code}</code>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="library-footer">
                <div className="tip">
                    <Info size={14} />
                    <span>Tip: Click on the VNC screen to insert click commands!</span>
                </div>
            </div>
        </div>
    )
}
