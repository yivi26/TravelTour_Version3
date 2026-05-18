-- ============================================================
-- TravelTour - Clean Database Schema
-- Database: MySQL 8.0+ | Charset: utf8mb4
-- Consolidated version: 2.0
-- ============================================================

DROP DATABASE IF EXISTS traveltour;
CREATE DATABASE traveltour
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE traveltour;

CREATE TABLE users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NULL,
    avatar_url VARCHAR(500) NULL,
    role ENUM('customer','provider','guide','admin') NOT NULL DEFAULT 'customer',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    email_verified TINYINT(1) NOT NULL DEFAULT 0,
    reset_token VARCHAR(255) NULL,
    reset_token_expires_at DATETIME NULL,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_email (email),
    INDEX idx_users_role (role),
    INDEX idx_users_is_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE providers (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    address VARCHAR(300) NULL,
    website_url VARCHAR(300) NULL,
    license_number VARCHAR(100) NULL,
    tax_code VARCHAR(50) NULL,
    phone VARCHAR(20) NULL,
    hotline VARCHAR(20) NULL,
    email VARCHAR(100) NULL,
    logo_url VARCHAR(500) NULL,
    bank_name VARCHAR(150) NULL,
    bank_branch VARCHAR(150) NULL,
    bank_account_number VARCHAR(50) NULL,
    bank_account_name VARCHAR(150) NULL,
    status ENUM('pending','approved','active','suspended') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_providers_user (user_id),
    INDEX idx_providers_status (status),
    CONSTRAINT fk_providers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tour_categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    description TEXT NULL,
    icon_url VARCHAR(300) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tour_categories_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE tours (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider_id INT UNSIGNED NOT NULL,
    guide_id INT UNSIGNED NULL,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL,
    code VARCHAR(100) NULL,
    description TEXT NULL,
    highlights LONGTEXT NULL,
    itinerary LONGTEXT NULL,
    location VARCHAR(200) NOT NULL,
    province VARCHAR(100) NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    base_price DECIMAL(14,0) NOT NULL DEFAULT 0,
    sale_price DECIMAL(14,0) NOT NULL DEFAULT 0,
    is_vat_enabled TINYINT(1) NOT NULL DEFAULT 0,
    tax_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    tax DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    final_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    duration_days SMALLINT NOT NULL DEFAULT 1,
    duration_text VARCHAR(100) NULL,
    duration_nights SMALLINT NOT NULL DEFAULT 0,
    min_participants SMALLINT NOT NULL DEFAULT 1,
    max_capacity SMALLINT NOT NULL DEFAULT 20,
    thumbnail_url VARCHAR(500) NULL,
    difficulty_level ENUM('easy','moderate','challenging') NOT NULL DEFAULT 'easy',
    eco_score DECIMAL(3,1) NOT NULL DEFAULT 0.0,
    language VARCHAR(50) NULL DEFAULT 'Vietnamese',
    includes TEXT NULL,
    excludes TEXT NULL,
    start_date DATETIME NULL,
    end_date DATETIME NULL,
    meeting_point VARCHAR(255) NULL,
    hotel_info TEXT NULL,
    transport_info TEXT NULL,
    cancel_policy TEXT NULL,
    terms_conditions TEXT NULL,
    other_notes TEXT NULL,
    status ENUM('draft','active','paused','full','archived') NOT NULL DEFAULT 'draft',
    management_actions_unlocked TINYINT(1) NOT NULL DEFAULT 0,
    total_bookings INT UNSIGNED NOT NULL DEFAULT 0,
    rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    rating_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tours_provider_slug (provider_id, slug),
    UNIQUE KEY uq_tours_provider_code (provider_id, code),
    INDEX idx_tours_provider (provider_id),
    INDEX idx_tours_guide (guide_id),
    INDEX idx_tours_status (status),
    INDEX idx_tours_province (province),
    INDEX idx_tours_price (base_price),
    FULLTEXT INDEX ft_tours_search (title, description, location),
    CONSTRAINT fk_tours_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE tour_images (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tour_id INT UNSIGNED NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    caption VARCHAR(200) NULL,
    display_order TINYINT NOT NULL DEFAULT 0,
    is_cover TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    INDEX idx_tour_images_tour (tour_id),
    CONSTRAINT fk_tour_images_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tour_category_map (
    tour_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (tour_id, category_id),
    CONSTRAINT fk_tour_category_map_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
    CONSTRAINT fk_tour_category_map_category FOREIGN KEY (category_id) REFERENCES tour_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tour_schedules (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tour_id INT UNSIGNED NOT NULL,
    departure_date DATE NOT NULL,
    return_date DATE NOT NULL,
    available_slots SMALLINT NOT NULL DEFAULT 0,
    booked_slots SMALLINT NOT NULL DEFAULT 0,
    price_override DECIMAL(14,0) NULL,
    note VARCHAR(300) NULL,
    status ENUM('open','full','cancelled','completed') NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tour_schedules_tour (tour_id),
    INDEX idx_tour_schedules_departure (departure_date),
    INDEX idx_tour_schedules_status (status),
    CONSTRAINT fk_tour_schedules_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE guides (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    provider_id INT UNSIGNED NOT NULL,
    bio TEXT NULL,
    specialty VARCHAR(200) NULL,
    languages VARCHAR(200) NULL,
    experience_years TINYINT NOT NULL DEFAULT 0,
    certification VARCHAR(300) NULL,
    rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    rating_count INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('active','inactive','on_leave') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_guides_user (user_id),
    INDEX idx_guides_provider (provider_id),
    INDEX idx_guides_status (status),
    CONSTRAINT fk_guides_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_guides_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

ALTER TABLE tours
  ADD CONSTRAINT fk_tours_guide_late
  FOREIGN KEY (guide_id) REFERENCES guides(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE bookings (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    tour_id INT UNSIGNED NOT NULL,
    schedule_id INT UNSIGNED NOT NULL,
    booking_code VARCHAR(20) NOT NULL,
    num_adults SMALLINT NOT NULL DEFAULT 1,
    num_children SMALLINT NOT NULL DEFAULT 0,
    num_infants SMALLINT NOT NULL DEFAULT 0,
    total_price DECIMAL(14,0) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(14,0) NOT NULL DEFAULT 0,
    final_price DECIMAL(14,0) NOT NULL DEFAULT 0,
    payment_method VARCHAR(32) NOT NULL DEFAULT 'momo',
    status ENUM(
      'pending',
      'pending_payment',
      'cancel_requested',
      'confirmed',
      'paid',
      'in_progress',
      'completed',
      'cancelled',
      'refunded'
    ) NOT NULL DEFAULT 'pending',
    contact_name VARCHAR(100) NULL,
    contact_phone VARCHAR(20) NULL,
    contact_email VARCHAR(191) NULL,
    special_requests TEXT NULL,
    cancelled_reason TEXT NULL,
    cancelled_at TIMESTAMP NULL,
    booked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_bookings_code (booking_code),
    INDEX idx_bookings_user (user_id),
    INDEX idx_bookings_tour (tour_id),
    INDEX idx_bookings_schedule (schedule_id),
    INDEX idx_bookings_status (status),
    CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_schedule FOREIGN KEY (schedule_id) REFERENCES tour_schedules(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id INT UNSIGNED NOT NULL,
    amount DECIMAL(14,0) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'VND',
    payment_method ENUM('bank_transfer','credit_card','momo','zalopay','vnpay','cash','other') NOT NULL DEFAULT 'bank_transfer',
    status ENUM('pending','success','failed','refunded') NOT NULL DEFAULT 'pending',
    transaction_id VARCHAR(200) NULL,
    gateway VARCHAR(50) NULL,
    gateway_response TEXT NULL,
    refund_amount DECIMAL(14,0) NULL,
    refund_reason TEXT NULL,
    paid_at TIMESTAMP NULL,
    refunded_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_payments_booking (booking_id),
    INDEX idx_payments_status (status),
    INDEX idx_payments_txn (transaction_id),
    CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE guide_assignments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id INT UNSIGNED NOT NULL,
    guide_id INT UNSIGNED NOT NULL,
    participation_status ENUM('assigned','confirmed','on_tour','completed','cancelled') NOT NULL DEFAULT 'assigned',
    note TEXT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_guide_assignments_booking (booking_id),
    INDEX idx_guide_assignments_guide (guide_id),
    INDEX idx_guide_assignments_status (participation_status),
    CONSTRAINT fk_guide_assignments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_guide_assignments_guide FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE reviews (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    tour_id INT UNSIGNED NOT NULL,
    rating TINYINT NOT NULL,
    title VARCHAR(200) NULL,
    comment TEXT NULL,
    photos JSON NULL,
    guide_rating TINYINT NULL,
    status ENUM('pending','approved','rejected','hidden') NOT NULL DEFAULT 'pending',
    admin_note TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_reviews_booking (booking_id),
    INDEX idx_reviews_tour (tour_id),
    INDEX idx_reviews_rating (rating),
    INDEX idx_reviews_status (status),
    CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE RESTRICT,
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_reviews_guide_rating CHECK (guide_rating BETWEEN 1 AND 5 OR guide_rating IS NULL)
) ENGINE=InnoDB;

CREATE TABLE notifications (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('booking_confirmed','payment_success','payment_failed','tour_reminder','guide_assigned','review_approved','promotion','system') NOT NULL DEFAULT 'system',
    channel ENUM('email','in_app','sms') NOT NULL DEFAULT 'in_app',
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    ref_id INT UNSIGNED NULL,
    ref_type VARCHAR(50) NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    INDEX idx_notifications_user (user_id),
    INDEX idx_notifications_is_read (is_read),
    INDEX idx_notifications_type (type),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE promotions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider_id INT UNSIGNED NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    discount_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
    discount_value DECIMAL(10,2) NOT NULL,
    min_order_value DECIMAL(14,0) NOT NULL DEFAULT 0,
    max_uses INT NULL,
    used_count INT NOT NULL DEFAULT 0,
    max_per_user TINYINT NOT NULL DEFAULT 1,
    applicable_to ENUM('all','specific_tour') NOT NULL DEFAULT 'all',
    tour_id INT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_promotions_code (code),
    INDEX idx_promotions_is_active (is_active),
    INDEX idx_promotions_expires (expires_at),
    CONSTRAINT fk_promotions_provider FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL,
    CONSTRAINT fk_promotions_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE recommendations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    tour_id INT UNSIGNED NOT NULL,
    score DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    reason VARCHAR(300) NULL,
    algorithm VARCHAR(50) NULL DEFAULT 'collab_filter',
    is_clicked TINYINT(1) NOT NULL DEFAULT 0,
    is_booked TINYINT(1) NOT NULL DEFAULT 0,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_recommendations_user_tour (user_id, tour_id),
    INDEX idx_recommendations_user (user_id),
    INDEX idx_recommendations_score (score DESC),
    CONSTRAINT fk_recommendations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_recommendations_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE wishlists (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    tour_id INT UNSIGNED NOT NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_wishlists_user_tour (user_id, tour_id),
    CONSTRAINT fk_wishlists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_wishlists_tour FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE voice_search_logs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NULL,
    raw_text TEXT NOT NULL,
    parsed_query JSON NULL,
    result_count SMALLINT NOT NULL DEFAULT 0,
    session_id VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_voice_search_logs_user (user_id),
    INDEX idx_voice_search_logs_created (created_at),
    CONSTRAINT fk_voice_search_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(300) NULL,
    table_name VARCHAR(64) NOT NULL,
    record_id INT UNSIGNED NULL,
    action ENUM('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','APPROVE','REJECT') NOT NULL,
    old_data JSON NULL,
    new_data JSON NULL,
    description VARCHAR(300) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_audit_logs_table (table_name),
    INDEX idx_audit_logs_user (user_id),
    INDEX idx_audit_logs_action (action),
    INDEX idx_audit_logs_created (created_at),
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE booking_travelers (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id INT UNSIGNED NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    gender ENUM('male','female','other') NOT NULL DEFAULT 'other',
    id_number VARCHAR(50) NOT NULL,
    traveler_type ENUM('adult','child','infant') NOT NULL DEFAULT 'adult',
    PRIMARY KEY (id),
    INDEX idx_booking_travelers_booking (booking_id),
    CONSTRAINT fk_booking_travelers_booking
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
      ON DELETE CASCADE
) ENGINE=InnoDB;