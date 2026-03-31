mod handler;
mod protocol;

use std::io::{self, BufRead, BufWriter, Write};

use protocol::JsonRpcResponse;

fn main() {
    let stdin = io::stdin().lock();
    let stdout = io::stdout();
    let mut writer = BufWriter::new(stdout.lock());

    for line in stdin.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<protocol::JsonRpcRequest>(&line) {
            Ok(req) => handler::handle_request(&req),
            Err(e) => JsonRpcResponse::error(0, -32700, format!("parse error: {e}")),
        };

        if let Ok(json) = serde_json::to_string(&response) {
            let _ = writeln!(writer, "{json}");
            let _ = writer.flush();
        }
    }
}
