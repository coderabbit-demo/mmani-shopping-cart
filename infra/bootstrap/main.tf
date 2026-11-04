terraform {
  required_version = "= 1.15.3"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 8.10.0"
    }
  }
}

variable "project_id" {
  type = string
  validation {
    condition     = var.project_id == "se-demos-project"
    error_message = "Only the approved project is permitted."
  }
}
variable "bucket_name" {
  type = string
  validation {
    condition     = var.bucket_name == "se-demos-project-deskdrop-tfstate"
    error_message = "Confirm ownership before using the approved bucket name."
  }
}
variable "state_operator" {
  type = string
  validation {
    condition     = can(regex("^(user|serviceAccount|group):[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$", var.state_operator))
    error_message = "Supply a concrete operator principal."
  }
}
provider "google" {
  project = var.project_id
  region  = "us-central1"
}
resource "google_storage_bucket" "state" {
  name                        = var.bucket_name
  project                     = var.project_id
  location                    = "US-CENTRAL1"
  labels                      = { service = "deskdrop", environment = "demo", managed_by = "terraform" }
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = true }
  lifecycle { prevent_destroy = true }
}
resource "google_storage_bucket_iam_member" "operator" {
  bucket = google_storage_bucket.state.name
  role   = "roles/storage.objectAdmin"
  member = var.state_operator
}
output "bucket_name" { value = google_storage_bucket.state.name }
