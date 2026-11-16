import { render } from 'preact'
import '@sabaki/shudan/css/goban.css'
import './styles.css'
import { App } from './app'

render(<App />, document.getElementById('app')!)
