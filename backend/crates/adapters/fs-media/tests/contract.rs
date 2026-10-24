use std::path::PathBuf;

use adapter_fs_media::FsMediaStore;
use domain::uuid::Uuid;
use ports::MediaStore;

fn fresh_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("rb-fs-media-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[tokio::test]
async fn media_store_contract() {
    let dirs = std::sync::Mutex::new(Vec::new());
    ports::contract::media_store(|| {
        let dir = fresh_dir();
        dirs.lock().unwrap().push(dir.clone());
        FsMediaStore::new(dir)
    })
    .await;
    for dir in dirs.into_inner().unwrap() {
        let _ = std::fs::remove_dir_all(dir);
    }
}

#[tokio::test]
async fn put_leaves_no_temp_files() {
    let dir = fresh_dir();
    let store = FsMediaStore::new(&dir);
    let name = format!("{}.jpg", Uuid::new_v4());
    store.put(&name, b"one".to_vec()).await.unwrap();
    store.put(&name, b"two".to_vec()).await.unwrap();
    let names: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    let _ = std::fs::remove_dir_all(&dir);
    assert_eq!(names, vec![name]);
}
