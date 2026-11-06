variable "cloud_release" {
  type    = bool
  default = false
}
locals {
  cloud_release = var.cloud_release || var.phase == "foundation"
}
resource "google_project_service" "cloud_build" {
  count              = local.cloud_release ? 1 : 0
  project            = var.project_id
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}
resource "google_service_account" "build" {
  count        = local.cloud_release ? 1 : 0
  project      = var.project_id
  account_id   = "deskdrop-build"
  display_name = "DeskDrop isolated OCI build"
  depends_on   = [google_project_service.cloud_build]
}
resource "google_service_account" "publisher" {
  count        = local.cloud_release ? 1 : 0
  project      = var.project_id
  account_id   = "deskdrop-publisher"
  display_name = "DeskDrop approved artifact publisher"
  depends_on   = [google_project_service.cloud_build]
}
resource "google_storage_bucket" "release" {
  for_each                    = local.cloud_release ? toset(["source", "artifacts"]) : toset([])
  project                     = var.project_id
  name                        = "se-demos-project-deskdrop-${each.key}"
  location                    = "US-CENTRAL1"
  labels                      = local.labels
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = true }
  lifecycle { prevent_destroy = true }
}
resource "google_storage_bucket_iam_member" "build_source" {
  count  = local.cloud_release ? 1 : 0
  bucket = google_storage_bucket.release["source"].name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.build[0].email}"
}
resource "google_storage_bucket_iam_member" "build_artifact" {
  count  = local.cloud_release ? 1 : 0
  bucket = google_storage_bucket.release["artifacts"].name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.build[0].email}"
}
resource "google_storage_bucket_iam_member" "publisher_artifact" {
  count  = local.cloud_release ? 1 : 0
  bucket = google_storage_bucket.release["artifacts"].name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.publisher[0].email}"
}
resource "google_artifact_registry_repository_iam_member" "publisher" {
  count      = local.cloud_release ? 1 : 0
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.publisher[0].email}"
}
resource "google_project_iam_member" "build_logs" {
  for_each = local.cloud_release ? {
    build     = google_service_account.build[0].email
    publisher = google_service_account.publisher[0].email
  } : {}
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${each.value}"
}
