mock_provider "google" {}
override_resource {
  target          = google_service_account.publisher[0]
  override_during = plan
  values = {
    email = "deskdrop-publisher@se-demos-project.iam.gserviceaccount.com"
  }
}
override_resource {
  target          = google_service_account.build[0]
  override_during = plan
  values = {
    email = "deskdrop-build@se-demos-project.iam.gserviceaccount.com"
  }
}
variables {
  project_id  = "se-demos-project"
  region      = "us-central1"
  zone        = "us-central1-a"
  environment = "demo"
  phase       = "foundation"
}
run "foundation_without_image" {
  command = plan
  assert {
    condition     = var.image_digest == null && length(google_storage_bucket.release) == 2
    error_message = "Foundation has no release and at most two private artifact buckets."
  }
  assert {
    condition     = alltrue([for b in google_storage_bucket.release : b.public_access_prevention == "enforced" && b.uniform_bucket_level_access && b.versioning[0].enabled && !b.force_destroy])
    error_message = "Artifact custody must be private and versioned."
  }
  assert {
    condition     = google_storage_bucket_iam_member.build_artifact[0].role == "roles/storage.objectCreator" && google_storage_bucket_iam_member.publisher_artifact[0].role == "roles/storage.objectViewer" && google_artifact_registry_repository_iam_member.publisher[0].member == "serviceAccount:${google_service_account.publisher[0].email}"
    error_message = "Build cannot publish; publisher cannot overwrite build artifacts."
  }
  assert {
    condition     = google_artifact_registry_repository_iam_member.publisher[0].role == "roles/artifactregistry.writer" && google_storage_bucket_iam_member.build_source[0].role == "roles/storage.objectViewer" && google_storage_bucket_iam_member.build_artifact[0].member == "serviceAccount:${google_service_account.build[0].email}" && google_service_account.build[0].email != google_service_account.publisher[0].email
    error_message = "Use separate build and publisher identities with resource-scoped roles."
  }
  assert {
    condition     = !google_project_service.cloud_build[0].disable_on_destroy && alltrue([for api in google_project_service.api : !api.disable_on_destroy]) && length(google_compute_instance.demo.network_interface[0].access_config) == 0 && google_compute_instance.demo.metadata["enable-oslogin"] == "TRUE" && google_compute_instance.demo.shielded_instance_config[0].enable_secure_boot && length(one(google_compute_firewall.iap.allow).ports) == 1 && contains(one(google_compute_firewall.iap.allow).ports, "22") && length(google_compute_firewall.iap.source_ranges) == 1 && contains(google_compute_firewall.iap.source_ranges, "35.235.240.0/20")
    error_message = "Foundation retains shared APIs, private VM, OS Login, Shielded VM and only IAP SSH."
  }
  assert {
    condition     = google_compute_instance.demo.boot_disk[0].initialize_params[0].image == "projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261104a"
    error_message = "Use only the explicitly approved VM image successor."
  }
}
run "foundation_rejects_image" {
  command = plan
  variables { image_digest = "us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  expect_failures = [var.image_digest]
}
run "release_rejects_missing_image" {
  command = plan
  variables { phase = "release" }
  expect_failures = [var.image_digest]
}
run "release_rejects_zero_image" {
  command = plan
  variables {
    phase        = "release"
    image_digest = "us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:0000000000000000000000000000000000000000000000000000000000000000"
  }
  expect_failures = [var.image_digest]
}
run "cloud_release_preserves_foundation" {
  command = plan
  variables {
    phase         = "release"
    cloud_release = true
    image_digest  = "us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  assert {
    condition     = length(google_storage_bucket.release) == 2 && length(google_service_account.build) == 1 && length(google_service_account.publisher) == 1 && var.phase == "release"
    error_message = "Release keeps the same foundation accounts and buckets."
  }
}
