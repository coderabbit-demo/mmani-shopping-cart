terraform {
  required_version = "= 1.15.3"
  backend "gcs" {}
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 8.10.0"
    }
  }
}
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
locals {
  labels = { service = "deskdrop", environment = var.environment, managed_by = "terraform" }
  apis   = toset(["compute.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "iam.googleapis.com", "iap.googleapis.com", "oslogin.googleapis.com"])
}
resource "google_project_service" "api" {
  for_each           = local.apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
resource "google_compute_network" "demo" {
  project                 = var.project_id
  name                    = "deskdrop-demo"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.api]
}
resource "google_compute_subnetwork" "demo" {
  project                  = var.project_id
  name                     = "deskdrop-demo"
  region                   = var.region
  network                  = google_compute_network.demo.id
  ip_cidr_range            = "10.90.0.0/24"
  private_ip_google_access = true
}
resource "google_compute_router" "demo" {
  project = var.project_id
  name    = "deskdrop-demo"
  region  = var.region
  network = google_compute_network.demo.id
}
resource "google_compute_router_nat" "demo" {
  project                            = var.project_id
  name                               = "deskdrop-demo"
  router                             = google_compute_router.demo.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"
  subnetwork {
    name                    = google_compute_subnetwork.demo.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }
}
resource "google_compute_firewall" "iap" {
  project       = var.project_id
  name          = "deskdrop-iap-ssh"
  network       = google_compute_network.demo.name
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["deskdrop-iap"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "deskdrop-demo-runtime"
  display_name = "DeskDrop demo runtime"
  depends_on   = [google_project_service.api]
}
resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = "deskdrop"
  format        = "DOCKER"
  labels        = local.labels
  cleanup_policies {
    id     = "delete-aged-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions { keep_count = 5 }
  }
  depends_on = [google_project_service.api]
}
resource "google_secret_manager_secret" "intake" {
  project   = var.project_id
  secret_id = "deskdrop-datadog-intake"
  labels    = local.labels
  replication {
    auto {}
  }
  depends_on = [google_project_service.api]
}
resource "google_artifact_registry_repository_iam_member" "pull" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_secret_manager_secret_iam_member" "intake" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.intake.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_compute_instance" "demo" {
  project      = var.project_id
  name         = "deskdrop-demo"
  machine_type = "e2-standard-2"
  zone         = var.zone
  tags         = ["deskdrop-iap"]
  labels       = local.labels
  metadata     = { enable-oslogin = "TRUE" }
  boot_disk {
    initialize_params {
      labels = local.labels
      image  = "projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261024"
      size   = 30
      type   = "pd-balanced"
    }
  }
  network_interface {
    subnetwork = google_compute_subnetwork.demo.id
  }
  service_account {
    email  = google_service_account.runtime.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
}
